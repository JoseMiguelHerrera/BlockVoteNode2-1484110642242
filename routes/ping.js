var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.send("All good. You don't need to be authenticated to call this");
});

module.exports = router;