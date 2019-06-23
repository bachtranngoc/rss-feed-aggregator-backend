const app = require('express')();
const queue = require('express-queue');
const routes = require('./routes');
const config = require('../config');

app.use(queue({
    activeLimit: 1,
    queuedLimit: 1
}));
app.use(routes);

app.listen(config.PORT, config.HOST_ADDRESS, () => {
    console.log(`Server is listening on host ${config.HOST_ADDRESS}, port ${config.PORT}`);
});
