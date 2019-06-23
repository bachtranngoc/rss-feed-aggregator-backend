const express = require('express');
const router = express.Router();
const feeds = require('./feeds');

router.use('/feeds', feeds);

router.all('*', function (req, res) {
    res.status(404).send({error: 'content not found or not supported'});
});

module.exports = router;
