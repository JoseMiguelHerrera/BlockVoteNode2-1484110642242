//chaincode for simple referendum vote election

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/hyperledger/fabric/core/chaincode/shim"
)

type referendumMetaData struct {
	ReferendumName    string
	NumberOfDistricts int
	TotalNoVotes      int
	TotalYesVotes     int
}

type districtReferendum struct {
	DistrictName string
	NoVotes      int
	YesVotes     int
	Votes        map[string]string //maps vote ID to vote
}

type voterState struct {
	Authorized   string
	HasVoted     string
	RegisteredBy string
}

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}

// ============================================================================================================================
// Main
// ============================================================================================================================
func main() { //main function executes when each peer deploys its instance of the chaincode
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}

// Init resets all the things
func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	//args: 0: name of referendum, 1: number of districts in referendum, 2+: names of districts

	if len(args) < 3 {
		return nil, errors.New("Incorrect number of arguments. Expecting at least one district name, the number of districts, and the ref name") //IN NODE TOO!
	}

	//create meta data
	numDistricts, err := strconv.Atoi(args[1])
	if err != nil {
		return nil, err
	}
	metaData := &referendumMetaData{ReferendumName: args[0], NumberOfDistricts: numDistricts, TotalNoVotes: 0, TotalYesVotes: 0}
	metaDataJSON, err := json.Marshal(metaData) //golang JSON (byte array)
	if err != nil {
		return nil, errors.New("Marshalling for metadata struct has failed")
	}
	err = stub.PutState("metadata", metaDataJSON) //writes the key-value pair ("metadata", json object)
	if err != nil {
		return nil, errors.New("put state of meta data has failed")
	}

	//create data model for districts
	i := 0
	for i < numDistricts {
		districtData := &districtReferendum{DistrictName: args[i+2], NoVotes: 0, YesVotes: 0, Votes: make(map[string]string)} //golang struct
		districtDataJSON, err := json.Marshal(districtData)                                                                   //golang JSON (byte array)
		if err != nil {
			return nil, errors.New("Marshalling for district struct has failed")
		}

		err = stub.PutState(args[i+2], districtDataJSON) //writes the key-value pair (args[0] (district name), json object)
		if err != nil {
			return nil, errors.New("put state of district data has failed")
		}
		i++
	}

	return nil, nil
}

// Invoke is our entry point to invoke a chaincode function
func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	fmt.Println("invoke is running " + function)

	// Handle different functions
	if function == "init" { //initialize the chaincode state, used as reset
		return t.Init(stub, "init", args)
	} else if function == "write" {
		return t.write(stub, args)
	} else if function == "error" {
		return t.error(stub, args)
	} else if function == "authorize" {
		return t.authorize(stub, args)
	} else if function == "requestToVote" {
		return t.requestToVote(stub, args)
	}

	fmt.Println("invoke did not find func: " + function) //error
	return nil, errors.New("Received unknown function invocation")
}

func (t *SimpleChaincode) error(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	err := stub.SetEvent("evtsender", []byte("generic error"))
	if err != nil {
		return nil, err
	}
	return nil, nil
}

func (t *SimpleChaincode) authorize(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) { //BY USE ONLY BY ADMIN/REGISTRAR!!
	var name string          //name of person who is being allowed to vote
	var allowedToVote string //yes or no
	var registrar string     //who is registering this user

	if len(args) != 3 { //IN NODE!
		return nil, errors.New("Incorrect number of arguments. Expecting 3. ID of the person who is being registered to vote,  yes or no, and name of registrar")
	}
	name = args[0]
	allowedToVote = args[1]
	registrar = args[2]

	//check allowedToVote value
	if strings.TrimRight(allowedToVote, "\n") != "yes" && strings.TrimRight(allowedToVote, "\n") != "no" { //IN NODE!
		return nil, errors.New("allowed to vote val needs to be a yes or no")
	}
	if strings.TrimRight(allowedToVote, "\n") == "no" { //IN NODE!
		return nil, errors.New("not allowed to overwrite allowedToVote with no, since it is the default")
	}

	//check if this user already has a record
	preExistRecord, err := stub.GetState(name) //gets value for the given key //IN NODE!
	if err != nil {                            //error with retrieval
		return nil, err
	}
	if preExistRecord == nil { //user already has a record
		return nil, errors.New(name + "hasn't yet requested to be eligible to vote registered")
	}
	//user record to be recorded
	voterRecord := &voterState{Authorized: allowedToVote, HasVoted: "no", RegisteredBy: registrar}
	voterRecordJSON, err := json.Marshal(voterRecord) //golang JSON (byte array)
	if err != nil {
		return nil, errors.New("Marshalling for voterRecord struct has failed")
	}
	err = stub.PutState(name, voterRecordJSON) //writes the key-value pair ("metadata", json object)
	if err != nil {
		return nil, errors.New("put state of voterRecord has failed")
	}

	return nil, nil
}

func (t *SimpleChaincode) requestToVote(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	var name string      //name of person who is being allowed to vote
	var registrar string //who is registering this user

	if len(args) != 2 { //IN NODE!
		return nil, errors.New("Incorrect number of arguments. Expecting 3. ID of the person who is being registered to vote,  yes or no, and name of registrar")
	}
	name = args[0]
	registrar = args[1]

	//check if this user already has a record
	preExistRecord, err := stub.GetState(name) //gets value for the given key //IN NODE!
	if err != nil {                            //error with retrieval
		return nil, err
	}
	if preExistRecord != nil { //user already has a record
		return nil, errors.New(name + "has alredy been registered")
	}
	//user record to be recorded
	voterRecord := &voterState{Authorized: "no", HasVoted: "no", RegisteredBy: registrar}
	voterRecordJSON, err := json.Marshal(voterRecord) //golang JSON (byte array)
	if err != nil {
		return nil, errors.New("Marshalling for voterRecord struct has failed")
	}
	err = stub.PutState(name, voterRecordJSON) //writes the key-value pair ("metadata", json object)
	if err != nil {
		return nil, errors.New("put state of voterRecord has failed")
	}
	return nil, nil
}

func (t *SimpleChaincode) write(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	//args: 0: name of person voting, 1: district where voting, 2: value of vote
	var name string
	var district string
	var value string

	var err error

	if len(args) != 3 { //IN NODE!
		return nil, errors.New("Incorrect number of arguments. Expecting 2. ID of the person, district to vote in, and value to set")
	}

	name = args[0]
	district = args[1]
	value = args[2]

	//check if given district exists
	votingDistrictRaw, err := stub.GetState(district) //IN NODE!
	if err != nil {
		return nil, err
	}
	if votingDistrictRaw == nil { //district doesn't exist
		return nil, errors.New("given district " + district + " doesn't exist")
	}
	//get metadata
	metadataRaw, err := stub.GetState("metadata")
	if err != nil { //get state error
		return nil, err
	}
	var metaDataStructToUpdate referendumMetaData
	err = json.Unmarshal(metadataRaw, &metaDataStructToUpdate)
	if err != nil { //unmarshalling error
		return nil, err
	}
	//get district
	var votingDistrictToUpdate districtReferendum
	err = json.Unmarshal(votingDistrictRaw, &votingDistrictToUpdate)
	if err != nil { //unmarshalling error
		return nil, err
	}
	//get data about user a hand
	var userData voterState
	userDataRaw, err := stub.GetState(name)
	if err != nil { //error
		return nil, err
	}
	if userDataRaw == nil { //user data doesn't exist
		return nil, errors.New(name + " has not been registered yet")
	}
	err = json.Unmarshal(userDataRaw, &userData)
	if err != nil { //unmarshalling error
		return nil, err
	}

	if strings.TrimRight(userData.HasVoted, "\n") == "yes" {
		return nil, errors.New("vote already exists")
	}
	if strings.TrimRight(userData.Authorized, "\n") == "no" {
		return nil, errors.New(name + "is not allowed to vote")
	}

	//if person has not already voted, update district data
	votingDistrictToUpdate.Votes[name] = value
	if strings.TrimRight(value, "\n") == "yes" {
		votingDistrictToUpdate.YesVotes++

	} else if strings.TrimRight(value, "\n") == "no" { //IN NODE!
		votingDistrictToUpdate.NoVotes++
	} else {
		return nil, errors.New("vote needs to be a yes or no")
	}

	NewDistrictDataJSON, err := json.Marshal(votingDistrictToUpdate) //golang JSON (byte array)
	if err != nil {                                                  //marshall error
		return nil, err
	}
	err = stub.PutState(district, NewDistrictDataJSON) //writes the key-value pair (electionMetaData, json object)
	if err != nil {
		return nil, err
	}

	//update metadata too
	if strings.TrimRight(value, "\n") == "yes" {
		metaDataStructToUpdate.TotalYesVotes++

	} else if strings.TrimRight(value, "\n") == "no" {
		metaDataStructToUpdate.TotalNoVotes++
	}

	electionMetaDataJSON, err := json.Marshal(metaDataStructToUpdate) //golang JSON (byte array)
	if err != nil {                                                   //marshall error
		return nil, err
	}

	err = stub.PutState("metadata", electionMetaDataJSON) //writes the key-value pair (electionMetaData, json object)
	if err != nil {
		return nil, err
	}

	userData.HasVoted = "yes"
	userDataJSON, err := json.Marshal(userData) //golang JSON (byte array)
	if err != nil {                             //marshall error
		return nil, err
	}

	err = stub.PutState(name, userDataJSON) //write name of voter at global level to easily detect if someone has already voted in ANY district
	if err != nil {
		return nil, err
	}

	return nil, nil
}

// Query is our entry point for queries
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	fmt.Println("query is running " + function)

	// Handle different functions
	if function == "dummy_query" { //read a variable
		fmt.Println("hi there " + function) //error
		return nil, nil
	} else if function == "read" {
		return t.read(stub, args)
	} else if function == "error" {
		return t.error(stub, args)
	}
	fmt.Println("query did not find func: " + function) //error

	return nil, errors.New("Received unknown function query")
}

func (t *SimpleChaincode) read(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	//args: 0: data being read
	var name string
	var jsonResp string

	if len(args) != 1 {
		return nil, errors.New("Incorrect number of arguments. Expecting name of the var to query")
	}

	name = args[0]
	valAsbytes, err := stub.GetState(name) //gets value for the given key
	if err != nil {                        //getstate error
		return nil, err
	}

	if valAsbytes == nil { //vote doesn't exist
		jsonResp = "{\"Error\":\"No data exists for " + name + "\"}"
		return nil, errors.New(jsonResp)
	}
	return valAsbytes, nil
}
