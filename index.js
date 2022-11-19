const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const e = require('express');
require('dotenv').config();
const port = process.env.PORT || 5000;


//middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.8r9nhhc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded
        next()
    })
}

async function run() {
    try {
        const appointmentOptionCollection = client.db('doctorsPortal').collection('AppointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');


        //Commentng lines are for available date query only
        app.get('/appointmentOptions', async (req, res) => {

            //query a date from client side
            const date = req.query.date;
            const query = {}
            const options = await appointmentOptionCollection.find(query).toArray()

            //findout booking date in your booking database
            const bookingQuery = { appointmentDate: date };
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            //map  the options from the booking database 
            options.forEach(option => {

                //filter Out the treatment name
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)

                //sort Out your booked dates on the particular date and option
                const bookedSlots = optionBooked.map(book => book.slot)

                //filter out the slots thats are not includes in the slots
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))

                // set the remaining option slot 
                option.slots = remainingSlots;
            })
            res.send(options)
        })

        app.get('/bookings', async (req, res) => {
            const booking = {}
            const bookings = await bookingsCollection.find(booking).toArray()
            res.send(bookings)
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden Access.' })
            }

            const query = { email: email }
            const bookings = await bookingsCollection.find(query).toArray()
            res.send(bookings)
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            // Query for booking date
            const query = {
                appointmentDate: booking.appointmentDate,
                treatment: booking.treatment,
                email: booking.email
            }
            const bookedDay = await bookingsCollection.find(query).toArray()

            //check if that day already have an appointment or not. If have then return a message
            if (bookedDay.length) {
                const message = `You already have a booking on ${booking.appointmentDate}. `
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingsCollection.insertOne(booking)
            res.send(result)
        })


        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token })
            }

            res.status(403).send({ accessToken: '' })
        })

        app.get('/users', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const AdminQuery = { email: decodedEmail }
            const user = await usersCollection.findOne(AdminQuery)
            console.log(user)
            if (user?.role !== 'admin') {
                return res.send([])
            }
            const query = {};
            const users = await usersCollection.find(query).toArray()
            res.send(users)
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === 'admin' })
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }

            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })


    }
    finally {

    }
}

run().catch(err => console.error(err))



app.get('/', (req, res) => {
    res.send('Doctor Portal Server is Running')
})

app.listen(port, () => {
    console.log(`Doctor Portals server is running on ${port}`);
})

/***
   * API Naming Convention 
   * app.get('/bookings')
   * app.get('/bookings/:id')
   * app.post('/bookings')
   * app.patch('/bookings/:id')
   * app.delete('/bookings/:id')
  */