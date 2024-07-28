const express = require('express');
const http = require('http');
const os = require('os');
const bodyParser = require('body-parser');
const { Server } = require('ws');
const socketIO = require('socket.io');
const axios = require('axios');

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);

app.use(bodyParser.json());

let buttonsState = {
    'security': false,
    'opendoor': false,
    'offlights': false,
    'alarm': false,
    'room': false,
    'dinning': false,
    'bathroom': false,
    'yarn': false
};

const FLASK_SERVER_URL = 'http://192.168.1.103:5001/socket/update_buttons';

app.get('/', (req, res) => {
    res.send(buttonsState);
});

app.post('/update_buttons', (req, res) => {
    buttonsState = req.body;
    console.log('Updated buttons state from POST:', buttonsState);
    io.emit('status_update', buttonsState); // Emitir el evento status_update a todos los clientes
    axios.post(FLASK_SERVER_URL, buttonsState)
        .then(response => {
            console.log('romario', response.data);
        })
        .catch(error => {
            console.error('Error updating Flask:', error);
        });
    res.sendStatus(200);
});

server.listen(PORT, '0.0.0.0', function () {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    console.log('Servidor escuchando en http://' + addresses[0] + ':' + PORT);
});

const io = socketIO(server);

io.on('connection', function (socket) {
    console.log('un usuario se ha conectado');
    socket.emit('status_update', buttonsState); // Emitir el estado inicial de los botones

    socket.on('message', function (data) {
        console.log('Mensaje recibido del cliente:', data);
        buttonsState = JSON.parse(data);
        io.emit('status_update', buttonsState); // Emitir el evento status_update a todos los clientes
    });
});

// WebSocket server setup
const wss = new Server({ server });

wss.on('connection', function (ws) {
    console.log('Conexión WebSocket establecida');
    // Enviar el estado actual de los botones al nuevo cliente WebSocket
    ws.send(JSON.stringify(buttonsState));

    ws.on('message', function (message) {
        console.log('Mensaje recibido del cliente WebSocket:', message);
        const updatedState = JSON.parse(message);
        buttonsState = updatedState;
        io.emit('status_update', buttonsState); // Emitir el evento status_update a todos los clientes

        // Send POST request to Flask server
        axios.post(FLASK_SERVER_URL, buttonsState)
            .then(response => {
                console.log('Estado de los botones actualizado en Flask:', response.data);
            })
            .catch(error => {
                console.error('Error actualizando el estado de los botones en Flask:', error);
            });
    });
});
