## Jan 12, 2017
- finished 4 routes /deploy (get), /writeVote (post), /readDistrict (post), and /metadata (post)
- deploy deploys the chaincode inside the src folder, with the initial data in the config file
- metadata gets the metadata for the election
- readDistrict gets you the data for a given district.
- writeVote writes a vote in a particular district, given a voter, their vote, and the district name.
- writeVote, readDistrict, and metadata must also be given a username of a registered and enrolled user in the blockchain
- the deploy route currently registers and enrolls a user given in the config (I wrote tommy as default). This need to be decoupled.