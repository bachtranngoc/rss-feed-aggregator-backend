const config = {
    hostAddress: 'localhost',
    port: 3000,
    minutesBetweenUpdates: 10,
    dbName: 'rssFeedAggregator',
    feedUpdateLogCollection: 'feedUpdateLog',
    feedProvidersCollection: 'feedProviders',
    feedRecordsCollection: 'feedRecords',
    feed1: 'http://rss.sciam.com/ScientificAmerican-Global',
    feed2: 'https://rss.nytimes.com/services/xml/rss/nyt/Space.xml',
    feed3: 'http://www.tbray.org/ongoing/ongoing.atom',
    feed4: 'https://www.reddit.com/.rss',
    feed5: 'https://www.gamespot.com/feeds/game-news/'
};

module.exports = config;
