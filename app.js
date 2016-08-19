var express = require('express')
  , app = express()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server);

server.listen(8080);

var sanitize = require('validator').sanitize;
var createDOMPurify = require('dompurify');

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('mydb_test.db');
var check;

var AppPassword = "AdminPassIsNotPassword";

var ChatColor = "black";

db.serialize(function() {

	  db.run("CREATE TABLE if not exists ChatData (chatroom, username, data)");
	  //db.run("DELETE from ChatData");

});

//db.close();

// routing
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

// usernames which are currently connected to the chat
var usernames = {};

var muteBool = false;

// rooms which are currently available in chat
var rooms = ['General','Development','Links'];

io.sockets.on('connection', function (socket) {
	socket.emit('updatepeople', usernames);

	// when the client emits 'adduser', this listens and executes
	socket.on('adduser', function(username){
		// store the username in the socket session for this client
	    if(username == null || !username) {
	      socket.username = "Anonymous";
	      username = "Anonymous";
	      socket.emit('updatechat', 'SERVER', 'You are known as Anonymous');

	    } else {
	      socket.username = username;
	      socket.emit('updatechat', 'SERVER', 'You are known as ' + username);

	    }

		// store the room name in the socket session for this client
		socket.room = 'General';
		// add the client's username to the global list
		usernames[username] = username;
		//console.log(usernames);
    	socket.emit('updatepeople', usernames);

		// send client to room 1
		socket.join('General');
		// echo to client they've connected

    	socket.emit('updatechat', 'SERVER', 'You are connected to General');

		// echo to room 1 that a person has connected to their room
		if( muteBool == false ) {
			socket.broadcast.to('General').emit('updatechat', 'SERVER', username + ' has connected to this room');
		}

		
		db.serialize(function() {

			 db.each("SELECT * FROM ChatData WHERE chatroom = 'General'", function (err, row) {
		    	
		    	console.log(row);
		    	socket.emit('updatechatw', row);
			 });
		});

		

		socket.emit('updaterooms', rooms, 'General');
		


	});

	socket.on('sendchat', function (data) {
		
		var words = data.split(' ');

		if(words[0] == '/color'){
			if(!words[1]){
				console.log('No color chosen');
			} else {
				console.log('New Color: ' + words[1]);
				ChatColor = words[1];
			}

			return;
		}

		if(words[0] == '/mute'){
			if(!words[1]){
				console.log('No password supplied!');
			} else {

				if(words[1] == AppPassword){
					if (muteBool == false ){
						muteBool = true;
					} else {
						muteBool = false;
					}
					console.log('Mute Changes');
				} else {
					console.log('Incorrect password supplied.');
				}
			}

			return;

		}

		if(words[0] == '/dbclear'){
			if(!words[1]){
				console.log('No password supplied!');
			} else {

				if(words[1] == AppPassword){
					db.serialize(function() {

						  db.run("DELETE from ChatData");

					});
					console.log('Chat Database Cleared.');
					socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has cleared the DB');
				} else {
					console.log('Incorrect password supplied.');
				}
			}
			

			return;

		}

		if(data == AppPassword) {
			socket.username = "ChitChat Developer";
		} else {
			if( data == '' ) {
				console.log('BLANK POST');
			} else {
				function urlify(text) {
				    var urlRegex = /(https?:\/\/[^\s]+)/g;
				    return text.replace(urlRegex, function(url) {
				        return '<a href="' + url + '" target="_blank">' + url + '</a>';
				    })
				}

				console.log('LOG: ' + socket.username +': ' + data);

				var cleanText = data.replace(/<\/?[^>]+(>|$)/g, "");
				var cleanTextLink = urlify(cleanText);

				String.prototype.parseUsername = function() {
					return this.replace(/[@]+[A-Za-z0-9-_]+/g, function(u) {
						var username = u.replace("@","")
						//return u.link("http://twitter.com/"+username);
						return '<a href="#" onclick="hello(this);">@' + username + '</a>';
					});
				}; 

				var test = cleanTextLink;

				var Gs = test.parseUsername();
			   	
			   	String.prototype.parseHashtag = function() {
					return this.replace(/[#]+[A-Za-z0-9-_]+/g, function(t) {
						var tag = t.replace("#","")
						//return t.link("https://twitter.com/hashtag/"+tag);
						return '<a href="#">#' + tag + '</a>';
					});
				};

				var Ggs = Gs.parseHashtag();

				db.serialize(function() {
					//console.log('Running...');
					db.run("INSERT INTO ChatData VALUES (?, ?, ?)", [socket.room,socket.username,Ggs]);
				});

			    io.sockets.in(socket.room).emit('updatechat', 
			            

			            socket.username,
			           	Ggs,
			           	ChatColor

			    );
			}
		}
		

		socket.emit('updatepeople', usernames);

	});

	socket.on('switchRoom', function(newroom){
		if(muteBool == true ) {
			socket.emit('updatepeople', usernames);

			socket.leave(socket.room);
			socket.join(newroom);
			socket.room = newroom;
			
			db.serialize(function() {

				 db.each("SELECT * FROM ChatData WHERE chatroom = '"+socket.newroom+"'", function (err, row) {
			    	
			    	console.log(row);
			    	socket.emit('updatechatw', row);
				 });
			});

			socket.emit('updaterooms', rooms, newroom);

		} else {
			socket.emit('updatepeople', usernames);

			socket.leave(socket.room);
			socket.join(newroom);
			
			db.serialize(function() {

				 db.each("SELECT * FROM ChatData WHERE chatroom = '"+newroom+"'", function (err, row) {
			    	
			    	console.log(row);
			    	socket.emit('updatechatw', row);
				 });
			});

			socket.emit('updatechat', 'SERVER', 'You have connected to '+ newroom);
			// sent message to OLD room
			socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username+' has left this room');
			// update socket session room title
			socket.room = newroom;
			socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.username+' has joined this room');
			socket.emit('updaterooms', rooms, newroom);

		}
		
	});


	// when the user disconnects.. perform this
	socket.on('disconnect', function(){
		// remove the username from global usernames list
		delete usernames[socket.username];
		// update list of users in chat, client-side
		socket.emit('updatepeople', usernames);

		io.sockets.emit('updateusers', usernames);
		// echo globally that this client has left
		if(muteBool == false ) {
			socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
		}

		socket.leave(socket.room);
	});
});
