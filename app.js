process.env.GOPATH = __dirname;
var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
var Cloudant = require('cloudant');
const https = require('https');
var jwt = require('express-jwt');
var express = require('express');
// cfenv provides access to your Cloud Foundry environment
var cfenv = require('cfenv');
// create a new express server
var app = express();
// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));
//to get post variables
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

var cloudantUsername = '254ec36f-02c6-43e4-99ea-b840f2404041-bluemix';
var cloudantPassword = "8eae1d3dd1c3c4cc1b6e002c79e3ae18eaab2f328be5cad6ec9f0c2ab6421002"; //if we ever store anything remotely sensitive, we can't have this p/w here
var cloudant = Cloudant({ account: cloudantUsername, password: cloudantPassword });
var blockvoteDB;

var authenticate = jwt({
  secret: 'p6kzbzheMmEfTncjIk7B7awq8HXOVgh7ZNgOdmhJZsCCzDNZmayir4HF35MnbUS1',
  audience: 'Xg7JFB31LSA74IzWnv93UdqOAnc0juu8'
});

var ping = require('./routes/ping')
var secured = require('./routes/secured')

app.use('/ping', ping);
app.use('/secured', authenticate);

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function () {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

//******************************************************************************************CLOUDANT FUNCTIONS
var createDataBase = function (callback) {
  cloudant.db.create('blockvote', function (err, data) {
    if (err) {
      if (err.error === "file_exists") {
        blockvoteDB = cloudant.db.use('blockvote');
        callback(null, null); //db already exists
      } else {
        callback(err, null); //creation error
      }
    }
    else { //created successfully
      blockvoteDB = cloudant.db.use('blockvote');
      callback(null, data);
    }
  });
}


// create a document
var createDocument = function (id, val, callback) {
  // we are specifying the id of the document so we can update and delete it later
  blockvoteDB.insert({ _id: id, electionData: val }, function (err, data) {
    callback(err, data);
  });
};

// read a document
var readDocument = function (id, callback) {
  blockvoteDB.get(id, function (err, data) {
    callback(err, data);
  });
};

//******************************************************************************************GLOBAL VARIABLES
var config;
var chain;
var network;
var certPath;
var peers;
var users;
var userObj;
var newUserName;
var chaincodeID;
var certFile = 'us.blockchain.ibm.com.cert';
var chaincodeIDPath = __dirname + "/chaincodeID";
var chaincodeIDKnown;

var districts = [];
var voteOptions = [];

var caUrl;
var peerUrls = [];
var EventUrls = [];

createDataBase(function (err, resp) {
  if (err) { //creation error
    console.log("fatal error creating database, please start up the server again. error: " + err);
    process.exit();
  } else {
    if (!resp)
      console.log("blockvote db already existed, ready to use")
    else
      console.log("blockvote db created, ready to use")
  }
});



//******************************************************************************************ROUTES-ADMIN ONLY
app.get('/init', function (req, res) { //NEEDS TO BE CALLED EVERYTIME THE SERVER IS RESTARTED

  //REQUIRES: a proper config file
  //PROMISES: If deployment has already been done, an error mentioning this. If deployment is successful, returns election metadata.

  res.setHeader('Content-Type', 'application/json');
  init(function (err, resp) {
    if (err) {
      res.send(JSON.stringify({ error: err, response: null }));
    }
    else {
      read("admin", "metadata", function (err, readRes) {
        if (err) {
          if (err.message.includes("No data exists for")) {
            err.message = "init failed";
          }
          res.send(JSON.stringify({ error: err, response: null }));
        }
        else {
          res.send(JSON.stringify({ response: readRes, error: null }));
        }
      });
    }
  });
});


app.post('/addRegistrar', function (req, res) {
  //REQUIRES: the name of a registrar, the registrar's key modulus, the registrar's key exponent, and their district
  //PROMISES: if this registrar is a new registrar, and the key parts are encoded properly, and the district is valid, then this registrar will be added to the blockchain
  res.setHeader('Content-Type', 'application/json');
  var registrarName = req.body.registrarName  //empty check+preExistance check
  var registrarKeyModulus = req.body.registrarKeyModulus //empty check+encoding check
  var registrarKeyExponent = req.body.registrarKeyExponent//empty check+encoding check
  var registrarDistrict = req.body.registrarDistrict//empty check+existance check

  if (!registrarName || !registrarKeyModulus || !registrarKeyExponent || !registrarDistrict) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply: a registrar name, their key modululus and exponent, and the name of their district ";
    console.log(err.message);
    res.send(JSON.stringify({ error: err, response: null }));
  } else {
    // Read chaincodeID and use this for sub sequent Invokes/Queries
    readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
      if (err) {
        err.code = 503;
        err.message = "error reading election info from database";
        res.send(JSON.stringify({ error: err, response: null }));
      }
      else {
        chaincodeID = resp.electionData.chaincodeID;
        districts = resp.electionData.districts;
        voteOptions = resp.electionData.voteOptions;
      }
    });
    var isKeyModValid = true;
    var iskeyExpValid = true;
    if (!isKeyModValid) { //ADD CRYPTO CHECK
      err = new Error();
      err.code = 400;
      err.message = registrarKeyModulus + " is not encoded properly";
      console.log(err.message);
      res.send(JSON.stringify({ error: err, response: null }));
    } else {
      if (!iskeyExpValid) { //ADD CRYPTO CHECK
        err = new Error();
        err.code = 400;
        err.message = registrarKeyModulus + " is not encoded properly";
        console.log(err.message);
        res.send(JSON.stringify({ error: err, response: null }));
      } else {

        chain.getUser("admin", function (err, user) {
          if (err) {
            err2 = new Error();
            err2.code = 500;
            err2.message = " Failed to register and enroll " + deployerName + ": " + err;
            res.send(JSON.stringify({ error: err2, response: null }));
          }
          userObj = user;

          //check if desired district exists!
          read("admin", registrarDistrict, function (err, readResp) {
            if (!readResp) {

              if (err.message.includes("No data exists for")) {
                err.message = registrarDistrict + " does not exist";
              }

              console.log(err.message);
              delete err.stack;
              res.send(JSON.stringify({ error: err, response: null }));
            }
            else {
              //check that this registrar hasn't already been registered
              read("admin", "registarInfo", function (err, readResp) {
                if (readResp && JSON.parse(readResp).hasOwnProperty(registrarName)) {
                  err2 = new Error();
                  err2.code = 500;
                  err2.message = " The registrar " + registrarName + " is already registered ";
                  delete err2.stack;
                  res.send(JSON.stringify({ error: err2, response: null }));
                } else {

                  //can now invoke, query, etc
                  var args2 = [];
                  args2.push(registrarName);
                  args2.push(registrarKeyModulus);
                  args2.push(registrarKeyExponent);
                  args2.push(registrarDistrict);

                  invoke(args2, "writeRegistar", function (err, resp) {
                    if (err) {
                      res.send(JSON.stringify({ error: err, response: null }));
                    }
                    else {
                      resp.disclaimer = "This registration needs to be double checked";
                      res.send(JSON.stringify({ response: resp, error: null }));
                    }
                  });
                }


              });

            }

          });









        });




      }


    }




  }




});

//******************************************************************************************ROUTES-REGISTRAR ONLY

app.post('/registerVoter', function (req, res) {
  //REQUIRES: the government ID of the voter, the name of the registrar who is doing the registration
  //PROMISES: if this voter has not yet been registered, and the registrar is registered, the voter will be have a registration record created for them.
  res.setHeader('Content-Type', 'application/json');
  var govID = req.body.govID;
  var registrarName = req.body.registrarName;

  if (!govID || !registrarName) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply: the voter's govID and the registrar name";
    console.log(err.message);
    res.send(JSON.stringify({ error: err, response: null }));
  } else {
    // Read chaincodeID and use this for sub sequent Invokes/Queries
    readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
      if (err) {
        err.code = 503;
        err.message = "error reading election data from database";
        res.send(JSON.stringify({ error: err, response: null }));
      }
      else {
        chaincodeID = resp.electionData.chaincodeID;
        districts = resp.electionData.districts;
        voteOptions = resp.electionData.voteOptions;
      }
    });

    chain.getUser("admin", function (err, user) {
      if (err) {
        err2 = new Error();
        err2.code = 500;
        err2.message = " Failed to register and enroll admin: " + err;
        res.send(JSON.stringify({ error: err2, response: null }));
      }
      userObj = user;

      //check if this person has already registered
      read("admin", govID, function (err, readResp) {
        if (readResp) {
          err2 = new Error();
          err2.code = 400;
          err2.message = "User with govID " + govID + " is already registered";
          delete err2.stack;
          console.log(err2.message);
          res.send(JSON.stringify({ error: err2, response: null }));
        }
        else {
          //check if this registar is registered          
          read("admin", "registarInfo", function (err, readResp) {
            if (!readResp) {
              err2 = new Error();
              err2.code = 500;
              err2.message = "There are no registrars registered";
              delete err2.stack;
              res.send(JSON.stringify({ error: err2, response: null }));
            } else if (!JSON.parse(readResp).hasOwnProperty(registrarName)) {
              err2 = new Error();
              err2.code = 500;
              err2.message = " The registrar " + registrarName + " is not registered ";
              delete err2.stack;
              res.send(JSON.stringify({ error: err2, response: null }));
            } else {
              var args2 = [];
              args2.push(govID);
              args2.push(registrarName);

              invoke(args2, "register", function (err, resp) {
                if (err) {
                  res.send(JSON.stringify({ error: err, response: null }));
                }
                else {
                  resp.disclaimer = "This voter registration needs to be double checked";
                  res.send(JSON.stringify({ response: resp, error: null }));
                }
              });

            }
          });
        }
      });
    });
  }


});


//******************************************************************************************ROUTES-OPEN ROUTES

app.post('/VoterRegRecord', function (req, res) {
  //REQUIRES:
  //POST username: govID of A registered voter
  //PROMISES: the registration record of the voter if they have one
  res.setHeader('Content-Type', 'application/json');
  var govID = req.body.govID;
  read("admin", govID, function (err, readRes) {
    if (err) {
      if (err.message.includes("No data exists for")) {
        err.message = "voter with govID " + govID + " has not yet registered to vote";
      }
      res.send(JSON.stringify({ error: err, response: null }));
    }
    else {
      res.send(JSON.stringify({ response: readRes, error: null }));
    }
  });
});

app.post('/readDistrict', function (req, res) {
  /*REQUIRES:
  POST district: name of district you want to get information about
  PROMISES: data about the district, if valid
  */
  res.setHeader('Content-Type', 'application/json');
  var district = req.body.district;
  read("admin", district, function (err, readRes) {
    if (err) {
      if (err.message.includes("No data exists for")) {
        err.message = district + " is not a valid district";
      }
      res.send(JSON.stringify({ error: err, response: null }));
    }
    else {
      res.send(JSON.stringify({ response: readRes, error: null }));
    }
  });
});

app.post('/readVote', function (req, res) {
  /*REQUIRES: a signedToken ID and and signedToken Signature for a voter that has already voted
  PROMISES: if a vote has been registered with the signedToken, the vote will be returned.
  */
  res.setHeader('Content-Type', 'application/json');
  var signedTokenID = req.body.signedTokenID
  var signedTokenSig = req.body.signedTokenSig
  read("admin", signedTokenID + signedTokenSig, function (err, readRes) {
    if (err) {
      if (err.message.includes("No data exists for")) {
        err.message = "No vote exists for a voter with signed token: "+signedTokenID + signedTokenSig;
      }
      res.send(JSON.stringify({ error: err, response: null }));
    }
    else {
      res.send(JSON.stringify({ response: readRes, error: null }));
    }
  });
});

app.get('/getElectionInfo', function (req, res) {
  //REQUIRES: for an election to have been deployed from the config file
  //PROMISES: name of election, districts inside of it, and the options for voting*/

  res.setHeader('Content-Type', 'application/json');
  readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
    if (err) {
      err.code = 503;
      err.message = "error reading election info from database databse";
      res.send(JSON.stringify({ error: err, response: null }));
    }
    else {
      delete resp.electionData.chaincodeID;
      delete resp._rev;
      console.log(resp);
      res.send(JSON.stringify({ response: resp, error: null }));
    }
  });
});

app.get('/results', function (req, res) {
  //REQUIRES: for an election to have been deployed from the config file
  //PROMISES: get overall results of election, plus number of districts and the name of the eleciton
  res.setHeader('Content-Type', 'application/json');
  read("admin", "metadata", function (err, readRes) {
    if (err) {
      if (err.message.includes("No data exists for")) {
        err.message = "election has not yet been initializied properly";
      }
      res.send(JSON.stringify({ error: err, response: null }));
    } else {
      res.send(JSON.stringify({ response: readRes, error: null }));
    }
  });
});

app.get('/getRegistrarInfo', function (req, res) {
  //REQUIRES: for an election to have been deployed from the config file
  //PROMISES: get information about the registrars in the system
  res.setHeader('Content-Type', 'application/json');
  read("admin", "registarInfo", function (err, readRes) {
    if (err) {
      if (err.message.includes("No data exists for")) {
        err.message = "no registrars have been added yet";
      }
      res.send(JSON.stringify({ error: err, response: null }));
    } else {
      var readResJSON = JSON.parse(readRes);
      var registrars = [];

      for (var i in readResJSON) {
        var reg = readResJSON[i];
        var registrar = {
          "Registrar": {
            "RegistrarName": i,
            "KeyModulus": reg.KeyModulus,
            "KeyExponent": reg.KeyExponent,
            "RegistrationDistrict": reg.RegistrationDistrict
          },
        };
        registrars.push(registrar);
      }

      var registrarsJSON = JSON.stringify(registrars);
      res.send(JSON.stringify({ response: registrarsJSON, error: null }));
    }
  });
});


app.post('/writeVote', function (req, res) {

  res.setHeader('Content-Type', 'application/json');
  var signedTokenID = req.body.signedTokenID
  var signedTokenSig = req.body.signedTokenSig
  var vote = req.body.vote
  var registrarName = req.body.registrarName

  if (!signedTokenID || !signedTokenSig || !vote || !registrarName) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply: a voter's signedTokenID and signedTokenSig , a vote, and the name of the registrar who authorized the user";
    console.log(err.message);
    res.send(JSON.stringify({ error: err, response: null }));
  }
  else {
    // Read chaincodeID and use this for sub sequent Invokes/Queries
    readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
      if (err) {
        err.code = 503;
        err.message = "error reading election info from database";
        res.send(JSON.stringify({ error: err, response: null }));
      }
      else {
        chaincodeID = resp.electionData.chaincodeID;
        districts = resp.electionData.districts;
        voteOptions = resp.electionData.voteOptions;
      }
    });

    if (voteOptions.indexOf(vote) === -1) {
      err = new Error();
      err.code = 400;
      err.message = vote + " is an invalid vote";
      console.log(err.message);
      res.send(JSON.stringify({ error: err, response: null }));
    }
    else {
      chain.getUser("admin", function (err, user) {
        if (err) {
          err2 = new Error();
          err2.code = 500;
          err2.message = " Failed to register and enroll admin"
          res.send(JSON.stringify({ error: err2, response: null }));
        }
        userObj = user;

        //check if this registar is registered          
        read("admin", "registarInfo", function (err, readResp) {
          if (!readResp) {
            err2 = new Error();
            err2.code = 500;
            err2.message = "There are no registrars registered";
            delete err2.stack;
            res.send(JSON.stringify({ error: err2, response: null }));
          } else if (!JSON.parse(readResp).hasOwnProperty(registrarName)) {
            err2 = new Error();
            err2.code = 500;
            err2.message = " The registrar " + registrarName + " is not registered ";
            delete err2.stack;
            res.send(JSON.stringify({ error: err2, response: null }));
          }
          else {
            //check if this person has already voted
            read("admin", signedTokenID + signedTokenSig, function (err, readResp) {
              if (readResp) { //record found
                err2 = new Error();
                err2.code = 500;
                err2.message = "user with signedToken" + signedTokenID + signedTokenSig + " has already voted"
                delete err2.stack;
                res.send(JSON.stringify({ error: err2, response: null }));
              }
              else { // no record found
                if (!err.message.includes("No data exists for")) { //read error apart from no document found
                  res.send(JSON.stringify({ error: err, response: null }));
                } else {
                  var CRYPTOVERIFIED = true
                  if (!CRYPTOVERIFIED) {    //need actual crypto solution in nodeJS
                    err2 = new Error();
                    err2.code = 500;
                    err2.message = "user with signedToken" + signedTokenID + signedTokenSig + " is not authorized to vote by " + registrarName
                    delete err2.stack;
                    res.send(JSON.stringify({ error: err2, response: null }));
                  } else {
                    //can now invoke, query, etc
                    var args2 = [];
                    args2.push(signedTokenID);
                    args2.push(signedTokenSig);
                    args2.push(vote);
                    args2.push(registrarName);
                    invoke(args2, "writeVote", function (err, resp) {
                      if (err) {
                        res.send(JSON.stringify({ error: err, response: null }));
                      }
                      else {
                        resp.disclaimer = "This vote need to be double checked";
                        res.send(JSON.stringify({ response: resp, error: null }));
                      }
                    });

                  }


                }


              }
            });
          }
        });
      });
    }
  }

});



//******************************************************************************************HFC FUNCTIONS

function init(callback) { //INITIALIZATION
  console.log("Initializing chaincode from config.json");
  try {
    config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8')); //TURN CONFIG.JSON INTO CONFIG OBJECT
  } catch (err) {
    err.message = "config.json is missing or invalid file, Rerun the program with right file";
    err.code = 500;
    console.log(err.message)
    callback(err, null)
  }

  if (config.deployRequest.args.length < 6) {
    err = new Error();
    err.code = 500;
    err.message = "Incorrect number of arguments for init. Expecting at least: one district name, the number of districts, the number of vote options, at least 2 vote options, and the ref name. Check config file";
    console.log(err.message);
    callback(err, null);
  } else { //only continue if we have the min amount of args

    //new user that this whole process creates
    newUserName = config.user.username;
    // Create a client blockchin.

    if (!chain)
      chain = hfc.newChain(config.chainName); //USE THE GIVEN CHAIN NAME TO CREATE A CHAIN OBJECT

    certPath = __dirname + "/src/" + config.deployRequest.chaincodePath + "/certificate.pem";  //CREATE PATH TO ADD THE CERTIFICATE

    // Read and process the credentials.json
    try {
      network = JSON.parse(fs.readFileSync(__dirname + '/ServiceCredentials.json', 'utf8')); //TURN SERVICECREDENTIALS.JSON INTO NETWORK OBJECT
      if (network.credentials) network = network.credentials;
    } catch (err) {
      err.code = 500;
      err.message = "ServiceCredentials.json is missing or invalid file, Rerun the program with right file";
      console.log(err.message);
      callback(err, null)
    }

    peers = network.peers; // EXTRACT PEERS FROM NETWORK OBJECT
    users = network.users; // EXTRACT USERS FROM NETWORK OBJECT

    setup(); //CALL SET UP: ADDS PEERS FROM SERVICE CREDENTIALS TO BLOCKCHAIN. ALSO GETS THE USERNAME FOR THE NEW USER IN CONFIG

    printNetworkDetails();

    console.log("attempting to read election meta-data from DB");
    readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
      if (!err) {
        console.log("the election data for " + config.chainName + " was found on the DB");
        chaincodeIDKnown = true;
        chaincodeID = resp.electionData.chaincodeID;
        districts = resp.electionData.districts;
        voteOptions = resp.electionData.voteOptions;

      }
      else if (err.error === "not_found") {
        console.log("the election meta-data for " + config.chainName + " was not found on the DB");
        chaincodeIDKnown = false;
      } else if (err.error !== "not_found") {
        console.log("some other error happened: " + err);
        err.message = "unknown error happened on the database"
        err.code = 503;
        callback(err, null);
      }
      if (chaincodeIDKnown) {
        console.log("Chaincode was already deployed and users are ready! You can now invoke and query");
        console.log("election districts: " + districts);
        err = new Error();
        err.code = 202;
        err.message = "deployment: chaincode already deployed. Ready to invoke and query"
        delete err.stack;
        callback(err, null);
      } else {
        enrollAndRegisterUsers(callback); //ENROLL THE PRE-REGISTERED ADMIN (FROM membersrvc.YAML) AND SERVICECREDENTIALS, CALL deployChaincode!
      }
    });


  }
}

function setup() {
  // Determining if we are running on a startup or HSBN network based on the url
  // of the discovery host name.  The HSBN will contain the string zone.
  var isHSBN = peers[0].discovery_host.indexOf('secure') >= 0 ? true : false;
  var network_id = Object.keys(network.ca);
  caUrl = "grpcs://" + network.ca[network_id].discovery_host + ":" + network.ca[network_id].discovery_port;

  // Configure the KeyValStore which is used to store sensitive keys.
  // This data needs to be located or accessible any time the users enrollmentID
  // perform any functions on the blockchain.  The users are not usable without
  // This data.
  var uuid = network_id[0].substring(0, 8);
  chain.setKeyValStore(hfc.newFileKeyValStore(__dirname + '/keyValStore-' + uuid));

  if (isHSBN) {
    console.log("we are running on a HSBN Network");
    certFile = '0.secure.blockchain.ibm.com.cert';
  }
  else {
    console.log("we are running on a startup Network");
  }
  fs.createReadStream(certFile).pipe(fs.createWriteStream(certPath));
  var cert = fs.readFileSync(certFile);

  chain.setMemberServicesUrl(caUrl, {
    pem: cert
  });

  peerUrls = [];
  eventUrls = [];
  // Adding all the peers to blockchain
  // this adds high availability for the client
  for (var i = 0; i < peers.length; i++) {
    // Peers on Bluemix require secured connections, hence 'grpcs://'
    peerUrls.push("grpcs://" + peers[i].discovery_host + ":" + peers[i].discovery_port);
    chain.addPeer(peerUrls[i], {
      pem: cert
    });
    eventUrls.push("grpcs://" + peers[i].event_host + ":" + peers[i].event_port);

    /*
        chain.eventHubConnect(eventUrls[0], {
          pem: cert
        });
    */
  }
  // Make sure disconnect the eventhub on exit
  /*
    process.on('exit', function () {
      chain.eventHubDisconnect();
    });
  */
}

function enrollAndRegisterUsers(callback) { //enrolls admin

  // Enroll a 'admin' who is already registered because it is
  // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
  chain.enroll(users[0].enrollId, users[0].enrollSecret, function (err, admin) {
    if (err) {
      err = new Error();
      err.code = 500;
      err.message = "failed to enroll admin : " + err;
      callback(err, null)
    }

    console.log("\nEnrolled admin sucecssfully");

    // Set this user as the chain's registrar which is authorized to register other users.
    chain.setRegistrar(admin);


    //register and enroll our custom user (would be nice to refactor this out)

    //creating a new user
    var registrationRequest = {
      enrollmentID: newUserName,
      affiliation: config.user.affiliation
    };


    chain.registerAndEnroll(registrationRequest, function (err, user) {
      if (err) {
        err = new Error();
        err.code = 500;
        err.message = " Failed to register and enroll " + newUserName + ": " + err;
        callback(err, null);
      }
      console.log("\nEnrolled and registered " + newUserName + " successfully");
      userObj = user;


      //setting timers for fabric waits
      chain.setDeployWaitTime(config.deployWaitTime);
      console.log("\nDeploying chaincode ...");
      deployChaincode(callback);    //DEPLOYMENT OF CHAINCODE
    });


  });
}

function deployChaincode(callback) {
  var args = getArgs(config.deployRequest);

  var numDistricts = parseInt(args[1]);
  var numVoteOptions = parseInt(args[2 + numDistricts]);

  for (var i = 0; i < numVoteOptions; i++) {
    voteOptions.push(args[i + 3 + numDistricts]);
  }

  for (var i = 0; i < numDistricts; i++) { //start at 2 because it is the first of the district names, as per the data model
    districts.push(args[i + 2]);
  }

  // Construct the deploy request
  var deployRequest = {
    // Function to trigger
    fcn: config.deployRequest.functionName,
    // Arguments to the initializing function
    args: args,
    chaincodePath: config.deployRequest.chaincodePath,
    // the location where the startup and HSBN store the certificates
    certificatePath: network.cert_path
  };

  // Trigger the deploy transaction
  var deployTx = userObj.deploy(deployRequest);

  // Print the deploy results
  deployTx.on('complete', function (results) {
    // Deploy request completed successfully
    chaincodeID = results.chaincodeID;
    console.log("\nChaincode ID : " + chaincodeID);
    console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
    console.log("election districts: " + districts);
    var electionData =
      {
        chaincodeID: chaincodeID,
        districts: districts,
        voteOptions: voteOptions
      };
    // Save the chaincodeID
    createDocument(config.chainName, electionData, function (err, resp) { //write (chainName: chaincodeID) to db
      if (err) {
        err.code = 503;
        err.message = "error writing chaincodeid to databse after deployement";
        console.log(err.message);
        callback(err, null);
      }
      else {
        console.log("wrote election data to db after deployement");
        callback(null, results);
      }
    });

  });

  deployTx.on('error', function (err) {
    // Deploy request failed
    console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
    err.message = "chaincode error, failed to deploy chaincode"
    err.code = 504;
    callback(err, null);
  });

}


//voter, district, vote,
function invoke(args2, func, callback) {
  //var eh = chain.getEventHub();
  // Construct the invoke request
  var invokeRequest = {
    // Name (hash) required for invoke
    chaincodeID: chaincodeID,
    // Function to trigger
    fcn: func,
    // Parameters for the invoke function
    args: args2
  };


  customErr = null;

  // Trigger the invoke transaction
  var invokeTx = userObj.invoke(invokeRequest);

  // Print the invoke results
  invokeTx.on('submitted', function (results) {
    // Invoke transaction submitted successfully
    console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
  });
  invokeTx.on('complete', function (results) {
    // Invoke transaction completed successfully
    console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    callback(null, results);
  });
  invokeTx.on('error', function (err) {
    // Invoke transaction submission failed
    console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
    err.code = 504;
    err.message = "chaincode error: Failed to submit chaincode invoke"
    callback(err, null);
  });

  /*
    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function (event) {
      //custom event code
      eh.unregisterChaincodeEvent(regid);
    });
  */
}

function query(key, callback) {
  var args = [];
  args.push(key);

  // Construct the query request
  var queryRequest = {
    // Name (hash) required for query
    chaincodeID: chaincodeID,
    // Function to trigger
    fcn: "read",
    // Existing state variable to retrieve
    args: args
  };

  // Trigger the query transaction
  var queryTx = userObj.query(queryRequest);

  // Print the query results
  queryTx.on('complete', function (results) {
    // Query completed successfully
    console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest, results.result.toString());
    callback(null, results.result.toString());
  });
  queryTx.on('error', function (err) {
    // Query failed
    console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err);
    err2 = new Error();
    err2.code = 504;
    err2.message = err.msg;
    callback(err2, null);
  });
}


function read(userNameAction, key, callback) {
  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    callback(err, null);
  }
  else {
    if (!key) {
      err = new Error();
      err.code = 400;
      err.message = "you need to supply the name of a key that you want to query";
      console.log(err.message);
      callback(err, null);
    }
    else {
      // Read chaincodeID and use this for sub sequent Invokes/Queries
      readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
        if (err) {
          err.message = "error while reading document with key: " + key;
          callback(err, null);
        }
        else {
          chaincodeID = resp.electionData.chaincodeID;
          districts = resp.electionData.districts;
          voteOptions = resp.electionData.voteOptions;
        }
      });

      chain.getUser(userNameAction, function (err, user) {
        if (err) {
          err2 = new Error();
          err2.code = 500;
          err2.message = " Failed to register and enroll " + deployerName + ": " + err;
          callback(err2, null);

        }
        userObj = user;

        //can now invoke, query, etc

        query(key, function (err, resp) {
          if (err) {
            callback(err, null);
          }
          else {
            callback(null, resp);
          }
        });


      });
    }
  }
}



function getArgs(request) {
  var args = [];
  for (var i = 0; i < request.args.length; i++) {
    args.push(request.args[i]);
  }
  return args;
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
}

function printNetworkDetails() {
  console.log("\n------------- ca-server, peers and event URL:PORT information: -------------");
  console.log("\nCA server Url : %s\n", caUrl);
  for (var i = 0; i < peerUrls.length; i++) {
    console.log("Validating Peer%d : %s", i, peerUrls[i]);
  }
  console.log("");
  for (var i = 0; i < eventUrls.length; i++) {
    console.log("Event Url on Peer%d : %s", i, eventUrls[i]);
  }
  console.log("");
  console.log('-----------------------------------------------------------\n');
}