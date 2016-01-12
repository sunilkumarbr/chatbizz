var express = require('express');
var ejs = require('ejs');
var mongo = require('mongodb');
var http = require('http');
var bodyparser = require('body-parser');
var bcrypt = require('bcrypt');
var randtoken = require('rand-token');
var nodemailer = require('nodemailer');
var emailExistence = require('email-existence')
var session = require('express-session');

var app = express();
var port = Number(process.env.PORT || 3231);
var server = app.listen(port);
var io = require('socket.io').listen(server);
console.log('running at ' + port);

app.set('view engine', 'ejs');
app.use(express.static('views'));
app.use(express.static(__dirname + '/public'));
app.use(bodyparser.urlencoded({
    extended: true
}));
app.use(session({
    secret: 'fdggdgfdgsertrrtytiuyiuknmn'
}));
/******************DB**************/
var db, usersCollection;

mongo.connect("mongodb://chatbizz:Chunil@ds056998.mongolab.com:56998/chatbizz", function(error, r) {
    if (error)
        throw error;
    else {
        console.log("Connected to db");
        db = r;
        usersCollection = db.collection('user');
    }
})

/*********************mail auth***************/
var api_key = 'key-5a991ef3f090ef55a0a9b10b22a302c5';
var domain = 'sandbox19934a8f22484a7e99897c77e42d546d.mailgun.org';
var mailgun = require('mailgun-js')({
    apiKey: api_key,
    domain: domain
});

/**********************Routers********************/
var sess; //session variable
var preUserName;
var nxtUserName = 'initial';


app.get('/', function(req, res) {
    sess = req.session;
    if (sess.user) {
        res.redirect('/dashboard');
    } else {
        res.render('login', {
            found: ''
        });
    }
});


app.get('/dashboard', function(req, res) {
    // console.log('redirected to dashboard');
    sess = req.session;
    if (sess.user) {
        res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, post-check=0, pre-check=0');
        res.render('dashboard');
    } else {
        res.redirect('/');
    }
});

/*************************************/

app.get('/signup', function(req, res) {
    res.render('signup', {
        found: ''
    });
});

app.get('/login', function(req, res) {
    res.render('login', {
        found: ''
    });
});


app.post('/signup', function(req, res) {
    // console.log(req.body.name+' '+req.body.email+' '+req.body.phone+' '+req.body.password);

    usersCollection.find({
        name: req.body.name
    }).toArray(function(e, r) {
        if (e)
            throw e;
        else if (r[0] !== undefined)
            res.render('signup', {
                found: 'user name already exist'
            });
        else {
            usersCollection.find({
                email: req.body.email
            }).toArray(function(e, r) {
                if (e)
                    throw e;
                else if (r[0] !== undefined)
                    res.render('signup', {
                        found: 'email already exist'
                    });
                else {



                    emailExistence.check(req.body.email, function(err, result) {
                        if (err) throw err;
                        // console.log('res: ' + result);

                        if (result === true) {
                            usersCollection.find({
                                phone: parseInt(req.body.phone)
                            }).toArray(function(e, r) {
                                if (e)
                                    throw e;
                                else if (r[0] !== undefined)
                                    res.render('signup', {
                                        found: 'phone number already exist'
                                    });
                                else {
                                    var salt = bcrypt.genSaltSync(10);
                                    var hash = bcrypt.hashSync(req.body.password, salt);
                                    var token = randtoken.generate(80);

                                    var data = {
                                        from: 'ChatBizz <postmaster@sandbox19934a8f22484a7e99897c77e42d546d.mailgun.org>',
                                        to: req.body.email,
                                        subject: 'email-verification',
                                        html: '<h3>Thankyou for registering, Complete Your Activation to Get Started....<br/>click the below link to confirm email-id</h3><p><a href="http://' + req.headers.host + '/confirm/' + token + '">http://' + req.headers.host + '/confirm/' + token + '</a>'
                                    };

                                    mailgun.messages().send(data, function(error, body) {
                                        if (error) {
                                            res.render('signup', {
                                                found: 'It seems, email-id dose not exist. try again'
                                            });
                                        } else {
                                            usersCollection.insert({
                                                name: req.body.name,
                                                email: req.body.email,
                                                password: hash,
                                                phone: parseInt(req.body.phone),
                                                online: 'off',
                                                status: 'off',
                                                socket_id: null,
                                                friends: [],
                                                token: token
                                            });


                                            res.render('signup', {
                                                found: 'successfully signed up, please check your mail-box to confirm mail-id'
                                            });

                                        }
                                    });




                                }

                            });
                        } else
                            res.render('signup', {
                                found: 'email-id dose not exist please provide valid email-id'
                            });
                    });



                }

            });
        }

    });
});




app.post('/login', function(req, res) {
    var uName = req.body.name;
    var uPass = req.body.password;

    // var re = new RegExp('Admin' + "[a-zA-Z0-9]*", "g");
    usersCollection.find({
        name: uName
    }).toArray(function(e, r) {
        if (e)
            console.log(e);
        else
        if (r[0] != undefined) {
            if (r[0].status === 'on') {
                if (bcrypt.compareSync(uPass, r[0].password)) {

                    nxtUserName = req.body.name;
                    sess = req.session;
                    sess.user = req.body.name;
                    res.redirect('/dashboard');

                } else
                    res.render('login', {
                        found: 'password not correct'
                    });
            } else
                res.render('login', {
                    found: 'email-id is not verified please ckeck the mail-box and and click on the confirmation link that have been sent to you'
                });
        } else {
            res.render('login', {
                found: 'user not found'
            });
        }

    });
});



app.get('/confirm/:token', function(req, res) {
    // res.send(req.params.token);
    // console.log('in confirm');
    usersCollection.find({
        token: req.params.token
    }).toArray(function(e, r) {
        if (e)
            throw e;
        if (r[0] != undefined) {

            usersCollection.update({
                token: req.params.token
            }, {
                $set: {
                    token: null,
                    status: 'on'
                }
            });

            res.send('<body style="text-align:center;background:#C5E3BF;"><h3>You have been successfully registered<br/>Thankyou for confirming, you can now login with your user details</h3><a href="/login">login</a></body>');
        } else
            res.send('<body style="text-align:center;background:#C5C1AA;"><h3>Unable to confirm now, This link might be used already (OR) The user may not exist</h3><a href="/signup">signup again</a></body>');


    });
});


app.get('/resend', function(req, res) {
    res.render('resend', {
        found: ''
    });
});

app.post('/resend', function(req, res) {
    usersCollection.find({
        email: req.body.email
    }).toArray(function(e, r) {
        if (e)
            throw e;
        if (r[0] != undefined) {
            if (r[0].token !== null) {

                var data = {
                    from: 'ChatBizz <postmaster@sandbox19934a8f22484a7e99897c77e42d546d.mailgun.org>',
                    to: req.body.email,
                    subject: 'verification-resend',
                    html: '<h3>Thankyou we have sent you this verification link again as you requested, Complete Your Activation to Get Started....<br/>click the below link to confirm email-id</h3><p><a href="http://' + req.headers.host + '/confirm/' + r[0].token + '">http://' + req.headers.host + '/confirm/' + r[0].token + '</a>'
                };

                mailgun.messages().send(data, function(error, body) {
                    if (error) throw res.send(error);

                    else {
                        res.render('resend', {
                            found: 'verification link have been sent successfully, please ckeck the mail-box and verify'
                        });
                    }
                });

            } else
                res.render('resend', {
                    found: 'you are no registered with us, please signup'
                });


        } else
            res.render('resend', {
                found: 'email-id not found'
            });

    });
});

/***********************logout and destroy the session************************/
app.get('/logout', function(req, res) {

    req.session.destroy(function(err) {
        if (err) {
            console.log(err);
        } else {
            res.redirect('/');
        }
    });

});

app.get('/*', function(req, res) {
    res.redirect('/');
});

/************************socket**************************/
io.on('connection', function(socket) {
    if (nxtUserName !== preUserName) {
        usersCollection.find({
            name: nxtUserName
        }).toArray(function(e, r) {
            if (e) throw e;
            else if(r[0]!==undefined){
                socket.broadcast.emit('isOnline', {
                    name: nxtUserName,
                    status: 'on'
                });
                socket.emit('myName', {
                    userName: nxtUserName,
                    friends: r[0].friends
                });
            }
        })
        usersCollection.update({
            name: nxtUserName
        }, {
            $set: {
                socket_id: socket.id,
                online: 'on'
            }
        });

    }
});


io.on('connection', function(socket) {
    console.log('user connected:', socket.id);


    socket.on('chat', function(data) {
        // console.log('sender:' + data.sender + 'reciver:' + data.reciver);
        // socket.broadcast.emit('chat',data.message);
        socket.emit('me', {
            message: data.message,
            timeStamp: data.timeStamp
        });

        usersCollection.find({
            name: data.reciver
        }).toArray(function(e, r) {
            if (e) throw e;
            else if (r[0] !== undefined) {
                socket.in(r[0].socket_id).emit('chat', {
                    message: data.message,
                    sender: data.sender,
                    timeStamp: data.timeStamp
                });


                var messageDb = db.collection(data.sender);
                var messages = messageDb.find({
                    reciver: data.reciver
                });
                // console.log('messageDb:',messageDb);
                messages.toArray(function(e, r) {
                    if (e)
                        throw e;
                    else {
                        if (r[0] === undefined)
                            messageDb.insert({
                                reciver: data.reciver,
                                message: [{
                                    text: data.message,
                                    sender: data.sender,
                                    timeStamp: data.timeStamp,
                                    aDate: data.aDate
                                }]
                            });
                        else {
                            messageDb.update({
                                reciver: data.reciver
                            }, {
                                $push: {
                                    message: {
                                        $each: [{
                                            text: data.message,
                                            sender: data.sender,
                                            timeStamp: data.timeStamp,
                                            aDate: data.aDate
                                        }]
                                    }
                                }
                            });
                        }
                    }
                });


            }
        });
    });

    socket.on('friendPhone',function(data){
        usersCollection.find({
            name: data
        }).toArray(function(e, r) {
            if (e) throw e;
            else if (r[0] !== undefined) {
                socket.emit('friendPhoneRes',r[0].phone);
            }
        });
    });

    socket.on('display', function(details) {

        usersCollection.find({
            name: details.recipient
        }).toArray(function(e, r) {
            if (e) throw e;
            else if (r[0] !== undefined) {
                socket.emit('status', r[0].online);
            }
        });

        var me = db.collection(details.me);
        var recp = db.collection(details.recipient);

        var array1 = new Array(),
            array2 = new Array();

        m = me.find({
            reciver: details.recipient
        });
        m.toArray(function(e, r) {
            if (e)
                throw e;
            else if (r[0] !== undefined)
                for (var i = 0; i < r[0].message.length; i++)
                    array1.push(r[0].message[i]);

            r = recp.find({
                reciver: details.me
            });
            r.toArray(function(e, r) {
                if (e)
                    throw e;
                else if (r[0] !== undefined)
                    for (var i = 0; i < r[0].message.length; i++)
                        array2.push(r[0].message[i]);

                /****mesgs to aray****/
                var i = array1.length - 1;
                var j = array2.length - 1;
                var k = 0;
                var array3 = new Array();

                while (i >= 0 && j >= 0)
                    if (array1[i].aDate < array2[j].aDate)
                        array3[k++] = array2[j--];
                    else if (array1[i].aDate === array2[j].aDate) {
                    array3[k++] = array1[i--];
                    array3[k++] = array2[j--];
                } else
                    array3[k++] = array1[i--];

                while (i >= 0)
                    array3[k++] = array1[i--];
                while (j >= 0)
                    array3[k++] = array2[j--];

                socket.emit('msglist', array3);
                array3 = [];
            });
        });

    });


    socket.on('searchFriend', function(data) {
        // console.log(data);
        if (data.number) {
            usersCollection.find({
                phone: parseInt(data.number)
            }).toArray(function(e, r) {
                if (e) throw e;
                else if (r[0] !== undefined) {
                    // console.log('user found:',r[0].name);
                    socket.emit('userFound', {
                        status: 1,
                        name: r[0].name,
                        email: r[0].email,
                        phone: r[0].phone
                    });
                } else {
                    // console.log('no user found by phone');
                    socket.emit('userFound', {
                        status: 0,
                        name: null,
                        email: null,
                        phone: 0
                    });
                }
            });
        } else if (data.email) {
            usersCollection.find({
                email: data.email
            }).toArray(function(e, r) {
                if (e) throw e;
                else if (r[0] !== undefined) {
                    // console.log('user found:',r[0].name);
                    socket.emit('userFound', {
                        status: 1,
                        name: r[0].name,
                        email: r[0].email,
                        phone: r[0].phone
                    });
                } else {
                    // console.log('no user found by email');
                    socket.emit('userFound', {
                        status: 0,
                        name: null,
                        email: null,
                        phone: 0
                    });
                }
            });
        }

    });


    socket.on('addFriend', function(data) {
        // console.log('me:'+data.me+'f:'+data.friendName+'p:'+data.phone);
        usersCollection.update({
            name: data.me
        }, {
            $push: {
                friends: {
                    $each: [
                        [data.friendName, parseInt(data.phone)]
                    ]
                }
            }
        }, function(e, r) {
            if (e) throw e;
            // else console.log(r);
        });
        socket.emit('addFToList', {
            name: data.friendName,
            phone: parseInt(data.phone)
        });
    });



    socket.on('disconnect', function() {
        console.log('user disconnected:', socket.id);
        // console.log(socket.id);
        preUserName = 'reintial'

        usersCollection.find({
            socket_id: socket.id
        }).toArray(function(e, r) {
            if (e)
                throw e;
            else if (r[0] != undefined) {
                // console.log(r[0]);
                socket.broadcast.emit('isOnline', {
                    name: r[0].name,
                    status: 'off'
                });
                usersCollection.update({
                    socket_id: socket.id
                }, {
                    $set: {
                        online: 'off',
                        socket_id: null
                    }
                });

            }
        });
    });

});
