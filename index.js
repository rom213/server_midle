const express = require('express');
const expressWs = require('express-ws');
const bodyParser = require('body-parser');
const app = express();
expressWs(app);

app.use(bodyParser.json());

let buttonsState = {
    'security': false,
    'opendoor': false,
    'offlights': false,
    'alarm': false,
    'room': false,
    'dinning': false,
    'bathroom': false,
    'yarn': false,
    'closeDoor':true
};

// Endpoint to receive updates from Flask
app.post('/update_buttons', (req, res) => {
    buttonsState = req.body;
    console.log('Received update from Flask:', buttonsState);
    res.json(buttonsState);
});

app.ws('/echo', (ws) => {
    console.log('Client connected');

    // Send buttons state every 3 seconds
    const sendButtonsState = setInterval(() => {
        ws.send(JSON.stringify(buttonsState));
    }, 3000);

    ws.on('message', (msg) => {
        console.log('Received from ESP32:', msg);
        buttonsState = JSON.parse(msg); // Update state based on received message
        // Optionally, send an update to Flask if Node.js state changes
/*         fetch('http://192.168.1.104:5001/socket/update_buttons', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(buttonsState)
        }); */
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(sendButtonsState);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        clearInterval(sendButtonsState);
    });
});

const PORT = 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on port ${PORT}`);
});
