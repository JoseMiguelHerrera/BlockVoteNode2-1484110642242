process.env.GOPATH = __dirname;
var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
var Cloudant = require('cloudant');
const https = require('https');
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
var runningLocal = false; //leave this as false, I am phasing out the writing to the file system
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

var caUrl;
var peerUrls = [];
var EventUrls = [];

createDataBase(function (err, resp) {
  if (err) { //creation error
    res.send(JSON.stringify({ error: err }));
  } else {

    if (!resp)
      console.log("blockvote db already existed, ready to use")
    else
      console.log("blockvote db created, ready to use")
  }
});



//******************************************************************************************ROUTES-REGISTRAR ONLY
app.get('/init', function (req, res) { //NEEDS TO BE CALLED EVERYTIME THE SERVER IS RESTARTED
  /*
  REQUIRES: a proper config file
  PROMISES: If deployment has already been done, an error mentioning this. If deployment is successful, returns election metadata.
  */
  res.setHeader('Content-Type', 'application/json');
  init(function (err, resp) {
    if (err) {
      res.send(JSON.stringify({ error: err }));
    }
    else {

      read("admin", "metadata", function (err, readRes) {
        if (err)
          res.send(JSON.stringify({ error: err }));
        else {
          res.send(JSON.stringify({ response: readRes }));
        }
      });
    }
  });


});

app.post('/authorizeUser', function (req, res) {
  /*
REQUIRES:
POST username: username of registered/enrolled registrar
POST voter: name of voter who wants to register to vote
POST reg: 'yes' or 'no', if this voter is allowed to vote
PROMISES: if a user has not requested to vote yet, an error stating so will be returned. If a user has already been authorized, return error stating so.
If an authorization is successful, you will get the user's record back.
*/
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  var voter = req.body.voter; //voter to be registered
  var allowedToVote = req.body.reg; //"yes" or "no"
  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    res.send(JSON.stringify({ error: err }));
  }
  else {
    if (!voter || !allowedToVote) {
      err = new Error();
      err.code = 400;
      err.message = "you need to supply: a voter to register, and if they are allowed to vote or not: 'yes' or 'no'";
      console.log(err.message);
      res.send(JSON.stringify({ error: err }));
    }
    else {
      if (allowedToVote !== "yes" && allowedToVote !== "no") {
        err = new Error();
        err.code = 400;
        err.message = "allowed to vote val needs to be a yes or no";
        console.log(err.message);
        res.send(JSON.stringify({ error: err }));
      }
      else {
        // Read chaincodeID and use this for sub sequent Invokes/Queries
        if (runningLocal)
          chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
        else { //running on bluemix
          readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
            if (err) {
              res.send(JSON.stringify({ error: err }));
            }
            else {
              chaincodeID = resp.electionData.chaincodeID;
              districts = resp.electionData.districts;
            }
          });

        }

        chain.getUser(userNameAction, function (err, user) {
          if (err) {
            err2 = new Error();
            err2.code = 500;
            err2.message = " Failed to register and enroll " + userNameAction + ": " + err;
            res.send(JSON.stringify({ error: err2 }));
          }
          userObj = user;

          read(userNameAction, voter, function (err, readResp) {
            if (!readResp) {
              err2 = new Error();
              err2.code = 404;
              err2.message = voter + " has not yet requested to vote";
              console.log(err2.message);
              res.send(JSON.stringify({ error: err2 }));
            }
            else {
              if (allowedToVote === "no") {
                //do a read, nothing to do here. since the default allowed to vote is already no
                read(userNameAction, voter, function (err, readRes) {
                  if (err)
                    res.send(JSON.stringify({ error: err }));
                  else {
                    res.send(JSON.stringify({ response: readRes }));
                  }
                });
              }
              else {
                var args2 = [];
                args2.push(voter);
                args2.push(allowedToVote);
                args2.push(userNameAction);
                invoke(args2, "authorize", function (err, resp) {
                  if (err) {
                    res.send(JSON.stringify({ error: err }));
                  }
                  else {
                    read(userNameAction, voter, function (err, readRes) {
                      if (err)
                        res.send(JSON.stringify({ error: err }));
                      else {
                        res.send(JSON.stringify({ response: readRes }));
                      }
                    });
                  }
                });
              }
            }
          });
        });
      }
    }
  }
});

app.post('/readDistrict', function (req, res) {
  /*REQUIRES:
  POST username: username of registered/enrolled registrar
  POST district: name of district you want to get information about
  POST reg: 'yes' or 'no', if this voter is allowed to vote
  PROMISES: if a user has already been registered, an error stating so will be returned. If a new registration is successful, you will get the user's record back
  */
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  var district = req.body.district;
  read(userNameAction, district, function (err, readRes) {
    if (err)
      res.send(JSON.stringify({ error: err }));
    else {
      res.send(JSON.stringify({ response: readRes }));
    }
  });
});

app.post('/userStatus', function (req, res) {
  /*REQUIRES:
POST username: username of registered/enrolled registrar
POST voter: name of user you want to get the status about
PROMISES: status of the voter: have they registered and have they votedg*/
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  var voter = req.body.voter;

  read(userNameAction, voter, function (err, readRes) {
    if (err)
      res.send(JSON.stringify({ error: err }));
    else {
      res.send(JSON.stringify({ response: readRes }));
    }
  });
});


//************************************************************************************************************OTHER ROUTES
app.post('/requestToVote', function (req, res) {
  /*
REQUIRES:
POST username: username of registered/enrolled registrar
POST voter: name of voter who is requesting to be eligible to vote
PROMISES: if a user has already sent a request, an error stating so will be returned, with their authorization status
If a new registration is successful, you will get the user's record back
*/
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  var voter = req.body.voter; //voter to be registered

  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    res.send(JSON.stringify({ error: err }));
  }
  else {
    if (!voter) {
      err = new Error();
      err.code = 400;
      err.message = "you need to supply: the name of the voter wanting to request voting rights";
      console.log(err.message);
      res.send(JSON.stringify({ error: err }));
    }
    else {
      // Read chaincodeID and use this for sub sequent Invokes/Queries
      if (runningLocal)
        chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
      else { //running on bluemix
        readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
          if (err) {
            res.send(JSON.stringify({ error: err }));
          }
          else {
            chaincodeID = resp.electionData.chaincodeID;
            districts = resp.electionData.districts;
          }
        });

      }

      chain.getUser(userNameAction, function (err, user) {
        if (err) {
          err2 = new Error();
          err2.code = 500;
          err2.message = " Failed to register and enroll " + userNameAction + ": " + err;
          res.send(JSON.stringify({ error: err2 }));
        }
        userObj = user;

        read(userNameAction, voter, function (err, readResp) {
          if (readResp) {
            err2 = new Error();
            err2.code = 400;
            err2.message = voter + " has already requested to vote";
            console.log(err2.message);
            res.send(JSON.stringify({ error: err2, Authorized: JSON.parse(readResp).Authorized }));
          }
          else {
            var args2 = [];
            args2.push(voter);
            args2.push(userNameAction);
            invoke(args2, "requestToVote", function (err, resp) {
              if (err) {
                res.send(JSON.stringify({ error: err }));
              }
              else {
                read(userNameAction, voter, function (err, readRes) {
                  if (err)
                    res.send(JSON.stringify({ error: err }));
                  else {
                    res.send(JSON.stringify({ response: readRes }));
                  }
                });
              }
            });

          }
        });
      });
    }
  }
});


app.get('/getElectionInfo', function (req, res) {
  /*REQUIRES: for an election to have been deployed from the config file
PROMISES: name of election, districts inside of it, and the options for voting*/

  res.setHeader('Content-Type', 'application/json');
  readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
    if (err) {
      res.send(JSON.stringify({ error: err }));
    }
    else {
      resp.electionData.chaincodeID = "client doesn't need to know. Overriding for security";
      resp.electionData.answers = ["yes", "no"];
      console.log(resp);
      res.send(JSON.stringify(resp));
    }
  });
});


app.post('/writeVote', function (req, res) {
  /*REQUIRES:
POST username: username of registered/enrolled registrar
POST voter: name of user that wants to vote
POST district: district where the voter wants to vote
POST vote:  'yes' or 'no' vote
PROMISES: error if user not registered, error if user has already voted, error is user not authorized to vote, error is vote is invalid, error if district doesn't exist 
        if successful returns the user's profile */
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  var voter = req.body.voter;
  var district = req.body.district;
  var vote = req.body.vote;

  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    res.send(JSON.stringify({ error: err }));
  }
  else {
    if (!voter || !district || !vote) {
      err = new Error();
      err.code = 400;
      err.message = "you need to supply: a voter, a vote, and the name of the district where the vote occurs";
      console.log(err.message);
      res.send(JSON.stringify({ error: err }));
    }
    else {

      if (vote !== "yes" && vote !== "no") {
        err = new Error();
        err.code = 400;
        err.message = "vote val needs to be a yes or no";
        console.log(err.message);
        res.send(JSON.stringify({ error: err }));
      }
      else {

        // Read chaincodeID and use this for sub sequent Invokes/Queries

        if (runningLocal)
          chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
        else { //running on bluemix
          readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
            if (err) {
              res.send(JSON.stringify({ error: err }));
            }
            else {
              chaincodeID = resp.electionData.chaincodeID;
              districts = resp.electionData.districts;
            }
          });

        }

        chain.getUser(userNameAction, function (err, user) {
          if (err) {
            err2 = new Error();
            err2.code = 500;
            err2.message = " Failed to register and enroll " + deployerName + ": " + err;
            res.send(JSON.stringify({ error: err2 }));
          }
          userObj = user;


          //check if desired district exists!
          read(userNameAction, district, function (err, readResp) {
            if (!readResp) {
              err2 = new Error();
              err2.code = 400;
              err2.message = district + " doesn't exist!";
              console.log(err2.message);
              res.send(JSON.stringify({ error: err2 }));
            }
            else {
              read(userNameAction, voter, function (err, readResp) {
                if (!readResp) { //no record
                  err2 = new Error();
                  err2.code = 400;
                  err2.message = voter + " has not requested to vote yet. Please request to vote before voting";
                  console.log(err2.message);
                  res.send(JSON.stringify({ error: err2 }));
                }
                else {
                  if (JSON.parse(readResp).Authorized === "no") {
                    err2 = new Error();
                    err2.code = 400;
                    err2.message = voter + " is not authorized to vote";
                    console.log(err2.message);
                    res.send(JSON.stringify({ error: err2 }));
                  }
                  else if (JSON.parse(readResp).HasVoted === "yes") {
                    err2 = new Error();
                    err2.code = 400;
                    err2.message = voter + " already voted. You can only vote once";
                    console.log(err2.message);
                    res.send(JSON.stringify({ error: err2 }));
                  }
                  else {
                    //can now invoke, query, etc
                    var args2 = [];
                    args2.push(voter);
                    args2.push(district);
                    args2.push(vote);

                    invoke(args2, "write", function (err, resp) {
                      if (err) {
                        res.send(JSON.stringify({ error: err }));
                      }
                      else {
                        read(userNameAction, voter, function (errE, readResp) {
                          if (err)
                            res.send(JSON.stringify({ error: errE }));
                          else
                            res.send(JSON.stringify({ response: readResp }));
                        });

                      }
                    });

                  }
                }

              });
            }
          });
        });
      }
    }
  }
});

app.post('/UserAuthorizationStatus', function (req, res) {
  /*
REQUIRES:
POST username: username of registered/enrolled registrar
POST voter: name of voter who wants to wants to know if they are authorized to vote
PROMISES: 'yes' or 'no', if they are authorized to vote
*/

  var userNameAction = req.body.username;
  var voter = req.body.voter; //voter to be registered
  res.setHeader('Content-Type', 'application/json');
  read(userNameAction, voter, function (err, readRes) {
    if (readRes) {
      res.send(JSON.stringify({ response: JSON.parse(readRes).Authorized }));
    }else{
      res.send(err);
    }
  });
});

app.post('/results', function (req, res) {
  /*REQUIRES: for an election to have been deployed from the config file
PROMISES: get overall results of election, plus number of districts and the name of the eleciton*/
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  read(userNameAction, "metadata", function (err, readRes) {
    if (err)
      res.send(JSON.stringify({ error: err }));
    else {
      res.send(JSON.stringify({ response: readRes }));
    }
  });
});

app.get('/elections', function (req, res) {
  //dummy functions which gives you the currently avaible elections (1 election for now, the one in the config)
  var elections = [];
  elections.push(config.chainName);
  res.send(JSON.stringify({ response: elections }));
});




//******************************************************************************************HFC FUNCTIONS

function init(callback) { //INITIALIZATION

  console.log("Initializing chaincode from config.json");
  try {
    config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8')); //TURN CONFIG.JSON INTO CONFIG OBJECT
  } catch (err) {
    console.log("config.json is missing or invalid file, Rerun the program with right file")
    err.code = 500;
    callback(err, null)
  }

  if (config.deployRequest.args.length < 3) {
    err = new Error();
    err.code = 500;
    err.message = "Incorrect number of arguments for init. Expecting at least one district name, the number of districts, and the ref name. Check config file";
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
      console.log("ServiceCredentials.json is missing or invalid file, Rerun the program with right file")
      err.code = 500;
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
      }
      else if (err.error === "not_found") {
        console.log("the election meta-data for " + config.chainName + " was not found on the DB");
        chaincodeIDKnown = false;
      } else if (err.error !== "not_found") {
        console.log("some other error happened: " + err);
        callback(err, null);
      }
      if (chaincodeIDKnown) {
        console.log("Chaincode was already deployed and users are ready! You can now invoke and query");
        console.log("election districts: " + districts);
        err = new Error();
        err.code = 202;
        err.error = "deployment: chaincode already deployed. Ready to invoke and query"
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
      err.error = "failed to enroll admin : " + err;
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
        err.error = " Failed to register and enroll " + newUserName + ": " + err;
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

  for (var i = 2; i < args.length; i++) { //start at 2 because it is the first of the district names, as per the data model
    districts.push(args[i]);
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
    // Save the chaincodeID

    if (runningLocal) {
      fs.writeFileSync(chaincodeIDPath, chaincodeID); //THIS WRITE ONLY WORKS WHEN RUNNING LOCALLY!
      callback(null, results);
    }
    else { //running on bluemix
      console.log("election districts: " + districts);
      var electionData =
        {
          chaincodeID: chaincodeID,
          districts: districts
        };

      createDocument(config.chainName, electionData, function (err, resp) { //write (chainName: chaincodeID) to db
        if (err) {
          console.log("error writing chaincodeid to db after deployement");
          callback(err, null);
        }
        else {
          console.log("wrote election data to db after deployement");
          callback(null, results);
        }
      });
    }

  });

  deployTx.on('error', function (err) {
    // Deploy request failed
    console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
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
    callback(err.msg.toString(), null);
  });
}


function read(userNameAction, key, callback) {
  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    //res.send(JSON.stringify({ error: err }));
    callback(err, null);
  }
  else {
    if (!key) {
      err = new Error();
      err.code = 400;
      err.message = "you need to supply the name of a key that you want to query";
      console.log(err.message);
      //res.send(JSON.stringify({ error: err }));
      callback(err, null);
    }
    else {
      // Read chaincodeID and use this for sub sequent Invokes/Queries

      if (runningLocal) {
        chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
      } else {
        readDocument(config.chainName, function (err, resp) { //not_found is the err.error if not found
          if (err) {
            //res.send(JSON.stringify({ error: err }));
            callback(err, null);

          }
          else {
            chaincodeID = resp.electionData.chaincodeID;
            districts = resp.electionData.districts;
          }
        });
      }

      chain.getUser(userNameAction, function (err, user) {
        if (err) {
          err2 = new Error();
          err2.code = 500;
          err2.message = " Failed to register and enroll " + deployerName + ": " + err;
          //res.send(JSON.stringify({ error: err2 }));
          callback(err2, null);

        }
        userObj = user;

        //can now invoke, query, etc

        query(key, function (err, resp) {
          if (err) {
            //res.send(JSON.stringify({ error: err }));
            callback(err, null);
          }
          else {
            //res.send(JSON.stringify({ response: resp }));
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