//chaincode for simple referendum vote election

package main

import (
	"bytes"
	"crypto"
	"crypto/rsa"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/hyperledger/fabric/core/chaincode/shim"
)

type referendumMetaData struct {
	ReferendumName    string
	NumberOfDistricts int
	TotalVotes        map[string]int
	VoteOptions       []string
	Districts         []string
}

type districtReferendum struct {
	DistrictName string
	TotalVotes   map[string]int
	Votes        map[string]string //maps vote ID to vote
}

type registrationRecord struct { //key: government ID
	RegisteredBy          string
	RegistrationTimestamp string
}

type voteRecord struct { //key: signed token
	Vote     string
	District string
}

type registrarInfo struct {
	KeyModulus           string
	KeyExponent          string
	RegistrationDistrict string
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
	} else if function == "writeVote" {
		return t.writeVote(stub, args)
	} else if function == "error" {
		return t.error(stub, args)
	} else if function == "register" {
		return t.register(stub, args)
	} else if function == "writeRegistar" {
		return t.addRegistrar(stub, args)
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

func (t *SimpleChaincode) addRegistrar(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) { //BY USE ONLY BY ADMIN!!!
	var registrarName string
	var registrarKeyModulus string
	var registrarKeyExponent string
	var registrarDistrict string

	if len(args) != 4 {
		return nil, errors.New("Incorrect number of arguments. Expecting 2- the registrar's name and key mod, key exp, and district")
	}

	registrarName = args[0]
	registrarKeyModulus = args[1]
	registrarKeyExponent = args[2]
	registrarDistrict = args[3]

	//check if encoding is correct on crypto
	decE, err := base64.StdEncoding.DecodeString(registrarKeyExponent)
	if err != nil {
		return nil, err //registrarKeyExponent not encoded properly
	}
	if decE == nil {
	}
	decN, err := base64.StdEncoding.DecodeString(registrarKeyModulus)
	if err != nil {
		return nil, err //registrarKeyModulus not encoded properly
	}
	if decN == nil {
	}

	registrarDB := make(map[string]registrarInfo)

	//get registrarInfo
	registrarInfoRaw, err := stub.GetState("registarInfo") //gets value for the given key
	if err != nil {                                        //error with retrieval
		return nil, err
	}
	if registrarInfoRaw != nil {
		//not the first registrar
		err = json.Unmarshal(registrarInfoRaw, &registrarDB)
		if err != nil { //unmarshalling error
			return nil, err
		}
	}

	if registrarDB[registrarName].KeyModulus != "" { //this registrar already exists
		return nil, errors.New("this registrar is already entered")
	}

	//check if given district exists
	votingDistrictRaw, err := stub.GetState(registrarDistrict) //IN NODE!
	if err != nil {
		return nil, err
	}
	if votingDistrictRaw == nil { //district doesn't exist
		return nil, errors.New("given district " + registrarDistrict + " doesn't exist")
	}

	registrarDB[registrarName] = registrarInfo{KeyModulus: registrarKeyModulus, KeyExponent: registrarKeyExponent, RegistrationDistrict: registrarDistrict}
	//write back
	registrarDBJSON, err := json.Marshal(registrarDB) //golang JSON (byte array)
	if err != nil {
		return nil, errors.New("Marshalling for registrarDB  has failed")
	}
	err = stub.PutState("registarInfo", registrarDBJSON)
	return nil, nil
}

func (t *SimpleChaincode) register(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) { //BY USE ONLY BY REGISTRAR!!
	var govID string
	var registrar string //who is registering this user

	if len(args) != 2 { //IN NODE!
		return nil, errors.New("Incorrect number of arguments. Expecting 2, govID, and registrar name")
	}
	govID = args[0]
	registrar = args[1]

	registrationTime := time.Now().Format(time.RFC850)

	//check if this user already has a record
	preExistRecord, err := stub.GetState(govID) //gets value for the given key //IN NODE!
	if err != nil {                             //error with retrieval
		return nil, err
	}
	if preExistRecord != nil { //user already has a record
		return nil, errors.New("person with the given ID=" + govID + " already exists on the system")
	}

	//check if this is a valid registrar
	registrarDB := make(map[string]registrarInfo)
	//get registrarInfo
	registrarInfoRaw, err := stub.GetState("registarInfo") //gets value for the given key
	if err != nil {                                        //error with retrieval
		return nil, err
	}
	if registrarInfoRaw != nil {
		//not the first registrar
		err = json.Unmarshal(registrarInfoRaw, &registrarDB)
		if err != nil { //unmarshalling error
			return nil, err
		}
	} else {
		return nil, errors.New("no registrars are registered in the system yet")
	}

	if registrarDB[registrar].KeyModulus == "" { //this registrar doesn't exist
		return nil, errors.New("registrar " + registrar + " doesn't exist")
	}

	//user record to be recorded
	voterRecord := &registrationRecord{RegisteredBy: registrar, RegistrationTimestamp: registrationTime}
	voterRecordJSON, err := json.Marshal(voterRecord) //golang JSON (byte array)
	if err != nil {
		return nil, errors.New("Marshalling for voterRecord struct has failed")
	}
	err = stub.PutState(govID, voterRecordJSON) //writes the key-value pair ("metadata", json object)
	if err != nil {
		return nil, errors.New("put state of voterRecord has failed")
	}
	return nil, nil
}

/*
func (t *SimpleChaincode) requestToVote(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	//THIS FUNCTION IS NO LONGER USED, WILL BE DELETED SOON
	var name string      //name of person who is being allowed to vote
	var registrar string //who is registering this user
	var yearOfBirth int
	var monthOfBirth int
	var dayOfBirth int

	if len(args) != 6 { //IN NODE!
		return nil, errors.New("Incorrect number of arguments. Expecting 5. ID of the person who is being registered to vote,  yes or no,  name of registrar, year, month and day of birth, and postal code")
	}
	name = args[0]
	registrar = args[1]
	yearOfBirth, _ = strconv.Atoi(args[2])
	monthOfBirth, _ = strconv.Atoi(args[3])
	dayOfBirth, _ = strconv.Atoi(args[4])

	dob := time.Date(yearOfBirth, time.Month(monthOfBirth), dayOfBirth, 23, 0, 0, 0, time.UTC)

	//check if this user already has a record
	preExistRecord, err := stub.GetState(name) //gets value for the given key //IN NODE!
	if err != nil {                            //error with retrieval
		return nil, err
	}
	if preExistRecord != nil { //user already has a record
		return nil, errors.New(name + "has alredy been registered")
	}
	//user record to be recorded
	voterRecord := &registrationRecord{Authorized: "no", HasVoted: "no", RegisteredBy: registrar, DateOfBirth: dob}
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
*/
func (t *SimpleChaincode) writeVote(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	//args: 0: signed token id of person voting, 1:signed token signature, 2: value of vote 3:registrar name
	var signedTokenID string
	var signedTokenSig string
	var value string
	var registrarName string

	var err error

	if len(args) != 4 {
		return nil, errors.New("Incorrect number of arguments. Expecting 3. signed token id of the person, signed token id, name of registrar, and vote value to set")
	}

	signedTokenID = args[0]
	signedTokenSig = args[1]
	value = args[2]
	registrarName = args[3]

	//get metadata aka global results
	metadataRaw, err := stub.GetState("metadata")
	if err != nil { //get state error
		return nil, err
	}
	var metaDataStructToUpdate referendumMetaData
	err = json.Unmarshal(metadataRaw, &metaDataStructToUpdate)
	if err != nil { //unmarshalling error
		return nil, err
	}

	//get registrar data
	registrarInfoRaw, err := stub.GetState("registarInfo")
	if err != nil {
		return nil, err
	}
	if registrarInfoRaw == nil { //no registrars added yet
		return nil, errors.New("no registrars have been added yet")
	}

	registrarDB := make(map[string]registrarInfo)
	err = json.Unmarshal(registrarInfoRaw, &registrarDB)
	if err != nil { //unmarshalling error
		return nil, err
	}

	//check if registrar exists
	if registrarDB[registrarName].KeyModulus == "" {
		return nil, errors.New("registrar " + registrarName + " doesn't exist")
	}

	//check if given district exists
	votingDistrictRaw, err := stub.GetState(registrarDB[registrarName].RegistrationDistrict)
	if err != nil {
		return nil, err
	}

	//get district
	var votingDistrictToUpdate districtReferendum
	err = json.Unmarshal(votingDistrictRaw, &votingDistrictToUpdate)
	if err != nil { //unmarshalling error
		return nil, err
	}

	//check if this user has already voted
	preVoteRaw, err := stub.GetState(signedTokenID + signedTokenSig)
	if err != nil { //error
		return nil, err
	}
	if preVoteRaw != nil { //user has already voted
		return nil, errors.New("user with signedToken " + signedTokenID + signedTokenSig + " has already voted")
	}

	/*		REPLACED WIH CRYPTO SOLUTION 	//check if user is registered, and get reg data

			var userData registrationRecord
			userDataRaw, err := stub.GetState(govID)
			if err != nil { //error
				return nil, err
			}
			if userDataRaw == nil { //user data doesn't exist
				return nil, errors.New("user with govID " + govID + "has not registered to vote")
			}
			err = json.Unmarshal(userDataRaw, &userData)
			if err != nil { //unmarshalling error
				return nil, err
			}
	*/

	/* CRYPTOGRAPHIC CHECK OF AUTHORIZATION USING BLINDED TOKEN+RSA
	if strings.TrimRight(userData.Authorized, "\n") == "no" {
		return nil, errors.New(name + "is not allowed to vote")
	}
	*/

	verified, err := isCryptoVerified(registrarDB[registrarName].KeyModulus, registrarDB[registrarName].KeyExponent, signedTokenID, signedTokenSig)
	if !verified {
		return nil, err
	}

	//tally vote in district
	if validVote(strings.TrimRight(value, "\n"), metaDataStructToUpdate.VoteOptions) { //checks if the vote value is inside the allowable votes
		votingDistrictToUpdate.TotalVotes[strings.TrimRight(value, "\n")]++ //adds a vote
	} else {
		return nil, errors.New("Invalid vote!")
	}
	votingDistrictToUpdate.Votes[signedTokenID+signedTokenSig] = value

	//update district
	NewDistrictDataJSON, err := json.Marshal(votingDistrictToUpdate) //golang JSON (byte array)
	if err != nil {                                                  //marshall error
		return nil, err
	}
	err = stub.PutState(registrarDB[registrarName].RegistrationDistrict, NewDistrictDataJSON)
	if err != nil {
		return nil, err
	}

	//tally overall vote
	metaDataStructToUpdate.TotalVotes[strings.TrimRight(value, "\n")]++ //adds a vote
	//update overall results
	electionMetaDataJSON, err := json.Marshal(metaDataStructToUpdate) //golang JSON (byte array)
	if err != nil {                                                   //marshall error
		return nil, err
	}
	err = stub.PutState("metadata", electionMetaDataJSON) //writes the key-value pair (electionMetaData, json object)
	if err != nil {
		return nil, err
	}

	//write signed token of voter at global level to easily detect if someone has already voted in ANY district
	globalVote := &voteRecord{Vote: value, District: registrarDB[registrarName].RegistrationDistrict}

	globalVoteJSON, err := json.Marshal(globalVote) //golang JSON (byte array)
	if err != nil {                                 //marshall error
		return nil, err
	}

	err = stub.PutState(signedTokenID+signedTokenSig, globalVoteJSON)
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

func isCryptoVerified(keyModulus string, keyExponent string, tokenID string, tokenSignature string) (bool, error) {

	//required to import the sha1 package
	hash := sha1.New()
	hello := hash.BlockSize
	fmt.Printf("%d\n", hello)

	//Make key object
	decN, err := base64.StdEncoding.DecodeString(keyModulus)
	if err != nil {
		return false, err
	}
	n := big.NewInt(0)
	n.SetBytes(decN)

	decE, err := base64.StdEncoding.DecodeString(keyExponent)
	if err != nil {
		return false, err
	}
	var eBytes []byte
	if len(decE) < 8 {
		eBytes = make([]byte, 8-len(decE), 8)
		eBytes = append(eBytes, decE...)
	} else {
		eBytes = decE
	}
	eReader := bytes.NewReader(eBytes)
	var e uint64
	err = binary.Read(eReader, binary.BigEndian, &e)
	if err != nil {
		return false, err
	}
	pKey := rsa.PublicKey{N: n, E: int(e)}

	//make the id and sig object
	id, err := base64.StdEncoding.DecodeString(tokenID) //ID of blinded token
	if err != nil {
		return false, err //illegal base64 data
	}

	sig, err := base64.StdEncoding.DecodeString(tokenSignature) //signature of blinded token
	if err != nil {
		return false, err //illegal base64 data
	}

	//hash the id
	newhash := crypto.SHA1
	pssh := newhash.New()
	pssh.Write(id)
	hashed := pssh.Sum(nil)

	//verify the signature
	opts := rsa.PSSOptions{SaltLength: 20, Hash: crypto.SHA1}
	if err = rsa.VerifyPSS(&pKey, newhash, hashed, sig, &opts); err != nil {
		return false, err //verification error
	}
	return true, nil //VERIFIED!

}
