process.env.GOPATH = __dirname;
var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
const https = require('https');
var express = require('express');
// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
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

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function () {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

//******************************************************************************************GLOBAL VARIABLES
var runningLocal = false;
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
var chaincodeIDPath;

if (runningLocal)
  chaincodeIDPath = __dirname + "/chaincodeID";
else
  chaincodeIDPath = "/home/vcap/app" + "/chaincodeID";



var caUrl;
var peerUrls = [];
var EventUrls = [];

//******************************************************************************************ROUTES
app.get('/deploy', function (req, res) {
  //deploy chaincode
  res.setHeader('Content-Type', 'application/json');
  init(function (err, resp) {
    if (err) {
      res.send(JSON.stringify({ error: err }));
    }
    else {
      res.send(JSON.stringify({ response: resp }));
    }
  });
});

app.post('/writeVote', function (req, res) {
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
      // Read chaincodeID and use this for sub sequent Invokes/Queries
      chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
      chain.getUser(userNameAction, function (err, user) {
        if (err) {
          err2 = new Error();
          err2.code = 500;
          err2.message = " Failed to register and enroll " + deployerName + ": " + err;
          res.send(JSON.stringify({ error: err2 }));
        }
        userObj = user;

        //can now invoke, query, etc

        invoke(voter, district, vote, function (err, resp) {
          if (err) {
            res.send(JSON.stringify({ error: err }));
          }
          else {
            res.send(JSON.stringify({ response: resp }));
          }
        });


      });
    }
  }




});

app.post('/readDistrict', function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  var district = req.body.district;

  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    res.send(JSON.stringify({ error: err }));
  }
  else {
    if (!district) {
      err = new Error();
      err.code = 400;
      err.message = "you need to supply the name of a district that you want to query";
      console.log(err.message);
      res.send(JSON.stringify({ error: err }));
    }
    else {
      // Read chaincodeID and use this for sub sequent Invokes/Queries
      chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
      chain.getUser(userNameAction, function (err, user) {
        if (err) {
          err2 = new Error();
          err2.code = 500;
          err2.message = " Failed to register and enroll " + deployerName + ": " + err;
          res.send(JSON.stringify({ error: err2 }));
        }
        userObj = user;

        //can now invoke, query, etc

        query(district, function (err, resp) {
          if (err) {
            res.send(JSON.stringify({ error: err }));
          }
          else {
            res.send(JSON.stringify({ response: resp }));
          }
        });


      });
    }
  }
});


app.post('/metadata', function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  var userNameAction = req.body.username;
  if (!userNameAction) {
    err = new Error();
    err.code = 400;
    err.message = "you need to supply a username for the actor doing the action";
    console.log(err.message);
    res.send(JSON.stringify({ error: err }));
  }
  else {
    // Read chaincodeID and use this for sub sequent Invokes/Queries
    chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
    chain.getUser(userNameAction, function (err, user) {
      if (err) {
        err2 = new Error();
        err2.code = 500;
        err2.message = " Failed to register and enroll " + deployerName + ": " + err;
        res.send(JSON.stringify({ error: err2 }));
      }
      userObj = user;

      //can now invoke, query, etc

      query("metadata", function (err, resp) {
        if (err) {
          res.send(JSON.stringify({ error: err }));
        }
        else {
          res.send(JSON.stringify({ response: resp }));
        }
      });


    });
  }
});





//******************************************************************************************FUNCTIONS

function init(callback) { //INITIALIZATION

  console.log("Initializing chaincode from config.json");

  try {
    config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8')); //TURN CONFIG.JSON INTO CONFIG OBJECT
  } catch (err) {
    console.log("config.json is missing or invalid file, Rerun the program with right file")
    err.code = 500;
    callback(err, null)
  }

  //new user that this whole process creates
  newUserName = config.user.username;

  // Create a client blockchin.
  chain = hfc.newChain(config.chainName); //USE THE GIVEN CHAIN NAME TO CREATE A CHAIN OBJECT

  if (runningLocal)
    certPath = __dirname + "/src/" + config.deployRequest.chaincodePath + "/certificate.pem";  //CREATE PATH TO ADD THE CERTIFICATE
  else
    certPath = "/home/vcap/app" + "/src/" + config.deployRequest.chaincodePath + "/certificate.pem";  //CREATE PATH TO ADD THE CERTIFICATE



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
  //Check if chaincode is already deployed
  //TODO: Deploy failures aswell returns chaincodeID, How to address such issue?
  if (fileExists(chaincodeIDPath)) {
    console.log("Chaincode was already deployed and users are ready! You can now invoke and query");

    err = new Error();
    err.code = 202;
    err.error = "deployment: chaincode already deployed. Ready to invoke and query"
    callback(err, null);

  } else {
    enrollAndRegisterUsers(callback); //ENROLL THE PRE-REGISTERED ADMIN (FROM membersrvc.YAML) AND SERVICECREDENTIALS, CALL deployChaincode!
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
    chain.eventHubConnect(eventUrls[0], {
      pem: cert
    });
  }
  // Make sure disconnect the eventhub on exit
  process.on('exit', function () {
    chain.eventHubDisconnect();
  });
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
      console.log("what is in error: " + err);
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
    fs.writeFileSync(chaincodeIDPath, chaincodeID);
    callback(null, results);
  });

  deployTx.on('error', function (err) {
    // Deploy request failed
    console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
    callback(err, null);
  });




}

function invoke(voter, district, vote, callback) {
  var args2 = [];

  args2.push(voter);
  args2.push(district);
  args2.push(vote);

  var eh = chain.getEventHub();
  // Construct the invoke request
  var invokeRequest = {
    // Name (hash) required for invoke
    chaincodeID: chaincodeID,
    // Function to trigger
    fcn: "write",
    // Parameters for the invoke function
    args: args2
  };

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

  //Listen to custom events
  var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function (event) {
    console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
    eh.unregisterChaincodeEvent(regid);
  });
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

