var express = require('express');
var router = express.Router();

router.get('/ping', function(req, res) {
  res.status(200).send("All good. You only get this message if you're authenticated");
});

//GET requests

router.get('/requests', function(req, res) {
  req.user.
  res.status(200).send("Here are some requests");
});

// PUT request, Update a record
router.put('/requests', function(req, res) {
  res.status(200).send("Request update");
});
module.exports = router;