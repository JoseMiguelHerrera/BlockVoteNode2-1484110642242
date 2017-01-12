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
		return nil, errors.New("Incorrect number of arguments. Expecting at least one district name, the number of districts, and the ref name")
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
	}

	fmt.Println("invoke did not find func: " + function) //error
	return nil, errors.New("Received unknown function invocation")
}

func (t *SimpleChaincode) error(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	return nil, errors.New("generic error")
}

func (t *SimpleChaincode) write(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	//args: 0: name of person voting, 1: district where voting, 2: value of vote
	var name string
	var district string
	var value string

	var err error

	if len(args) != 3 {
		return nil, errors.New("Incorrect number of arguments. Expecting 2. ID of the person, district to vote in, and value to set")
	}

	name = args[0]
	district = args[1]
	value = args[2]

	//check if given district exists
	votingDistrictRaw, err := stub.GetState(district)
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

	//check if user has voted, in any district
	preExistVote, err := stub.GetState(name) //gets value for the given key
	if err != nil {
		return nil, err
	}
	if preExistVote != nil { //vote already exists
		return nil, errors.New("vote already exists")
	}

	//if person has not already voted, update district data
	votingDistrictToUpdate.Votes[name] = value
	if strings.TrimRight(value, "\n") == "yes" {
		votingDistrictToUpdate.YesVotes++

	} else if strings.TrimRight(value, "\n") == "no" {
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

	err = stub.PutState(name, []byte(value)) //write name of voter at global level to easily detect if someone has already voted in ANY district
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
		jsonResp = "{\"Error\":\"Failed to get vote for " + name + "\"}"
		return nil, errors.New(jsonResp)
	}

	return valAsbytes, nil
}
