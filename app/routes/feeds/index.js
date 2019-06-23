const express = require('express');
const router = express.Router();
const actions = require('../../actions');

router.post('/update', actions.feeds.updateFeeds);

module.exports = router;

