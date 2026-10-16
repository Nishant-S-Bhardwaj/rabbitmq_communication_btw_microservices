const express = require('express');
const expressProxy = require('express-http-proxy');
const app = express();

app.use(express.json())

app.use("/user", expressProxy("http://user:3001"))
app.use("/captain", expressProxy("http://captain:3002"))
app.use("/ride", expressProxy("http://ride:3003"))

app.listen(3000,()=>{
    console.log("API Gateway is running on port 3000")
})
