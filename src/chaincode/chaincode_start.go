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
	//TotalNoVotes      int
	//TotalYesVotes     int
	TotalVotes  map[string]int
	VoteOptions []string
	Districts   []string
}

type districtReferendum struct {
	DistrictName string
	//NoVotes      int
	//YesVotes     int
	TotalVotes map[string]int
	Votes      map[string]string //maps vote ID to vote
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

	if len(args) < 6 {
		return nil, errors.New("Incorrect number of arguments for init. Expecting at least: one district name, the number of districts, the number of vote options, at least 2 vote options, and the ref name. Check config file") //IN NODE TOO!
	}

	//extract indexing help
	numDistricts, err := strconv.Atoi(args[1])
	if err != nil {
		return nil, err
	}
	numOptions, err := strconv.Atoi(args[2+numDistricts])
	if err != nil {
		return nil, err
	}

	//create vote options object, used in both district and metadata
	i := 0
	var options = make([]string, numOptions) //slice (array) containing option names
	var voteOptions = make(map[string]int)   //(key, value) pairs of options to number of votes that each option has gotten
	for i < numOptions {
		options[i] = args[i+3+numDistricts]
		voteOptions[options[i]] = 0 //initialize each option has having 0 votes
		i++
	}

	//create data model for districts
	i = 0
	var districts = make([]string, numDistricts)
	//voteOptions[]
	for i < numDistricts {
		districts[i] = args[i+2]

		districtData := &districtReferendum{DistrictName: districts[i], Votes: make(map[string]string), TotalVotes: voteOptions} //golang struct
		districtDataJSON, err := json.Marshal(districtData)
		if err != nil {
			return nil, errors.New("Marshalling for district struct has failed")
		}

		err = stub.PutState(args[i+2], districtDataJSON) //writes the key-value pair (args[0] (district name), json object)
		if err != nil {
			return nil, errors.New("put state of district data has failed")
		}
		i++
	}

	//create metadata model
	metaData := &referendumMetaData{ReferendumName: args[0], NumberOfDistricts: numDistricts, VoteOptions: options, Districts: districts, TotalVotes: voteOptions}
	metaDataJSON, err := json.Marshal(metaData) //golang JSON (byte array)
	if err != nil {
		return nil, errors.New("Marshalling for metadata struct has failed")
	}
	err = stub.PutState("metadata", metaDataJSON) //writes the key-value pair ("metadata", json object)
	if err != nil {
		return nil, errors.New("put state of meta data has failed")
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

	if validVote(strings.TrimRight(value, "\n"), metaDataStructToUpdate.VoteOptions) { //checks if the vote value is inside the allowable votes
		votingDistrictToUpdate.TotalVotes[strings.TrimRight(value, "\n")]++ //adds a vote
	} else {
		return nil, errors.New("vote needs to be a yes or no")
	}

	votingDistrictToUpdate.Votes[name] = value

	NewDistrictDataJSON, err := json.Marshal(votingDistrictToUpdate) //golang JSON (byte array)
	if err != nil {                                                  //marshall error
		return nil, err
	}
	err = stub.PutState(district, NewDistrictDataJSON) //writes the key-value pair (electionMetaData, json object)
	if err != nil {
		return nil, err
	}

	//update metadata too
	metaDataStructToUpdate.TotalVotes[strings.TrimRight(value, "\n")]++ //adds a vote

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

func validVote(a string, list []string) bool {
	for _, b := range list {
		if b == a {
			return true
		}
	}
	return false
}
