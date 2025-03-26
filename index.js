import express from 'express';
import expressWs from 'express-ws';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
const app = express();
expressWs(app);

app.use(bodyParser.json());


let isEsp32Online = false;
// Estado inicial de los botones
const defaultButtonsState = {
    'security': false,
    'opendoor': false,
    'offlights': false,
    'alarm': false,
    'room': false,
    'dinning': false,
    'bathroom': false,
    'yarn': false,
    'closeDoor': false,
    'ethernet': false,
    'ethernet_state':false
};

let buttonsState = { ...defaultButtonsState };

// Endpoint para recibir actualizaciones desde Flask
app.post('/update_buttons', (req, res) => {
    buttonsState = req.body;
    console.log('Received update from Flask:', buttonsState);
    res.json(buttonsState);
});

// WebSocket para comunicación con el ESP32

let tryit = 0
app.ws('/echo', (ws) => {
    console.log('Client connected');
    isEsp32Online = true;

    // Temporizador para manejar inactividad del cliente
    let activityTimeout;

    // Enviar estado de botones al cliente cada 3 segundos
    const sendButtonsState = setInterval(() => {
        if (ws.readyState === ws.OPEN) { // Verificar si el WebSocket está abierto
            try {
                ws.send(JSON.stringify(buttonsState));
            } catch (error) {
                console.error('Error al enviar datos por WebSocket:', error);
            }
        } else {    
            console.log('WebSocket no está abierto.');
        }
    }, 3000);

    // Manejar mensajes recibidos desde el ESP32

    ws.on('message', (msg) => {
        clearTimeout(activityTimeout); // Resetear temporizador en cada mensaje recibido

        try {
            console.log('Received from ESP32:', msg);
            const newState = JSON.parse(msg);

            if (newState.hasOwnProperty('heartbeat')) {
                isEsp32Online = true;

                if (tryit == 4) {
                    fetch('http://192.168.1.108:5001/socket/esp32_update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ online: isEsp32Online })
                    })
                        .then(response => response.json())
                        .then(data => {
                            console.log('Respuesta de Flask:', data);
                        })
                        .catch(error => {
                            console.error('Error al enviar datos a Flask:', error);
                        });

                    tryit = 0;
                }

                tryit++;

                return;
            }


            buttonsState = newState;

            // Enviar actualización al servidor Flask
            fetch('http://192.168.1.108:5001/socket/update_buttons', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(buttonsState)
            })
                .then(response => response.json())
                .then(data => {
                    console.log('Respuesta de Flask:', data);
                })
                .catch(error => {
                    console.error('Error al enviar datos a Flask:', error);
                });
        } catch (error) {
            console.error('Error al procesar mensaje del ESP32:', error);
        }

        // Restablecer estado si no hay actividad en 10 segundos
        activityTimeout = setTimeout(() => {
            console.log('No hay actividad del ESP32. Restableciendo estado...');
            isEsp32Online = false;

            fetch('http://192.168.1.108:5001/socket/esp32_update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ online: isEsp32Online })
            })
                .then(response => response.json())
                .then(data => {
                    console.log('Respuesta de Flask:', data);
                })
                .catch(error => {
                    console.error('Error al enviar datos a Flask:', error);
                });

        }, 10000);
    });

    // Manejar desconexión del cliente
    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(sendButtonsState); // Detener el envío periódico
        clearTimeout(activityTimeout); // Limpiar el temporizador de inactividad

        isEsp32Online = false;
        buttonsState = { ...defaultButtonsState };


        fetch('http://192.168.1.108:5001/socket/esp32_update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ online: isEsp32Online })
        })
            .then(response => response.json())
            .then(data => {
                console.log('Respuesta de Flask:', data);
            })
            .catch(error => {
                console.error('Error al enviar datos a Flask:', error);
            });
    });

    // Manejar errores en el WebSocket
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        clearInterval(sendButtonsState); // Detener el envío periódico
        clearTimeout(activityTimeout); // Limpiar el temporizador de inactividad
    });
});



const PORT = 5000;

// Iniciar el servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on port ${PORT}`);
});
