
const amqp = require("amqplib");

const RABBITMQ_URL =
    process.env.RABBIT_URL || "amqp://guest:guest@rabbitmq:5672";

let connection;
let connecting;

async function connect() {
    if (connection) return connection;
    if (connecting) return connecting;

    connecting = (async () => {
        connection = await amqp.connect(RABBITMQ_URL);
        console.log("Connected to RabbitMQ");

        connection.on("error", (err) => {
            console.error("RabbitMQ connection error:", err.message);
        });

        connection.on("close", () => {
            console.error("RabbitMQ connection closed");
            connection = undefined;
        });

        return connection;
    })();

    try {
        return await connecting;
    } finally {
        connecting = undefined;
    }
}

async function subscribeToQueue(queueName, callback) {
    const conn = await connect();
    const consumerCount = Math.max(1, Number(process.env.DRIVER_WORKERS) || 1);

    for (let worker = 0; worker < consumerCount; worker += 1) {
        const ch = await conn.createChannel();
        await ch.prefetch(1);
        await ch.assertQueue(queueName, { durable: true });

        await ch.consume(queueName, async (message) => {
            if (!message) return;
            try {
                await callback(message.content.toString());
                ch.ack(message);
            } catch (err) {
                console.error(`Processing failed for "${queueName}":`, err.message);
                ch.nack(message, false, true);
            }
        }, { noAck: false });
    }

    console.log(`Consuming "${queueName}" with ${consumerCount} driver worker(s)`);
}

async function getQueueStatus(queueName) {
    const conn = await connect();
    const ch = await conn.createChannel();
    const status = await ch.assertQueue(queueName, { durable: true });
    await ch.close();
    return status;
}

async function publishToQueue(queueName, data) {
    const conn = await connect();
    const ch = await conn.createConfirmChannel();

    await ch.assertQueue(queueName, { durable: true });

    ch.sendToQueue(
        queueName,
        Buffer.from(data),
        { persistent: true }
    );
    await ch.waitForConfirms();
    await ch.close();
}

module.exports = {
    connect,
    subscribeToQueue,
    publishToQueue,
    getQueueStatus,
};
