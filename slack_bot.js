/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node slack_bot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "who are you?"

  The bot will tell you its name, where it is running, and for how long.

  Say: "Call me <nickname>"

  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"

  The bot will tell you your nickname, if it knows one for you.

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('./lib/Botkit.js');
var os = require('os');
var http = require('http');
var querystring = require('querystring');

// create dummy server that heroku can bind to, to prevent R10 error
var express = require('express');
var app = express();
var port = process.env.PORT || 5000;
//port for Heroku
app.set('port', (port));
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

var controller = Botkit.slackbot({
     debug: false,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();


var matchchannels = [];

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['http(.*)', 'https(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {
		
		var re = /<(.*)>/;
		// message.text = <URL>
		var inputlink = re.exec(message.text);
		/// <URL> --> URL
		convo.setVar('newlink', inputlink[1]);
		var newlink = inputlink[1];
		console.log('input message', inputlink, newlink);

		// create a path for when there are matching channels
		convo.addQuestion({
			text: "Pick a channel number from the list: {{vars.channels}}",
			action: 'completed' 
			},
			function(response, convo) {
				
				// find the channel data in the array
				var ids = matchchannels.map(function(chan) {return chan.id;} );
				var idx = ids.indexOf(response.text);
				console.log("ids", ids, idx);
				
				if (idx > -1) {
					bot.reply(message, 'OK, adding to ' + matchchannels[idx].name);
					
					addImpactURL(newlink, matchchannels[idx].token);				
				}
				else {
					bot.reply(message, "Sorry, " + response.text + " isn't on the list");					
				}				
				
				convo.next();
			},
			'',
			'yes_thread');

		// create a path for when there are NO matching channels
		convo.addMessage({
			text: 'No matches for that text.',
			action: 'stop',
		},'no_thread');
		
		
		if (!err) {
			convo.setVar('impactlink', message.input);
			convo.ask('That looks like an impact link! Should I add it to Impact Monitor?', [
				{	
					pattern: 'yes',
					callback: function(response, convo) {
						bot.reply(message, "OK! I will add the link");
						// go ahead and store the URL
						convo.next();
					}
				},
				{	
					pattern: 'no',
					callback: function(response, convo) {
						// no further action required
						convo.stop();
					}
				},
				{
					default: true,
                    callback: function(response, convo) {
						convo.stop();
                    }					
				}
			]);
			convo.ask('What project is this for?', function(response, convo) {
                bot.reply(message, 'OK, looking for ' + response.text);
				matchIMChannel(response.text, convo);
//				convo.next();
			});			
			convo.on('end', function(convo) {
				if (convo.status == 'completed') {
					bot.reply(message, 'Thanks!');
				}
				else {
					// this happens if the conversation ended prematurely for some reason
                    bot.reply(message, 'OK, nevermind!');
				}
			});
		};
	});
});

controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });
	
function matchIMChannel (channel, convo) {
	var url = 'http://impactmonitor.net/app/api/channels.php';

	var matchstring = '';
	matchchannels = [];
	
	var qs = {
        action: 'list',
        api_key: process.env.IM_KEY_ICFJ
    };
	var query = querystring.stringify(qs);

	http.get(url + '?' + query, function(gtresp) {
	//console.log("Get response: " + gtresp.statusCode);
		
		var body = '';
		
		gtresp.setEncoding('utf8');
						
		gtresp.on('data', function(chunk) {
			body += chunk;
		});
		gtresp.on('end', function() {
//			console.log("BODY: " + body);
		
			var jbody = JSON.parse(body);
			if (jbody.channels) {
				for (var i=0; i<jbody.channels.length; i++) {
					// matches the search? (case-insensitive search!)
					if (jbody.channels[i].name.toLowerCase().indexOf(channel.toLowerCase()) > -1) {
						console.log('result:', jbody.channels[i].channel_id, jbody.channels[i].name, jbody.channels[i].unique_id_token);	
						// asve the channel data
						matchchannels.push({id: jbody.channels[i].channel_id, name: jbody.channels[i].name, token: jbody.channels[i].unique_id_token});
						// build the response string
						matchstring += '[' + jbody.channels[i].channel_id + '] ' + jbody.channels[i].name + ' ;';							
					}
				}
			} 
			
			console.log('matchstring', matchstring);
			if (matchstring.length > 0) {
				convo.setVar('channels', matchstring);
				convo.changeTopic('yes_thread');				
			}
			else 
			{ 
				convo.setVar('channels', 'no match');
				convo.changeTopic('no_thread');
			}
		});
	});	
	
//	console.log(matchstring);
//	return matchstring;		
}

function addImpactURL(newlink, linkchannel) {
	var url = 'http://impactmonitor.net/app/api/channels.php';

	console.log("adding", newlink, linkchannel);
	
	var qs = {
        action: 'add_item',
        api_key: process.env.IM_KEY_ICFJ,
		uniqueid: linkchannel,
		item: newlink
    };
	var query = querystring.stringify(qs);

	http.get(url + '?' + query, function(gtresp) {
	//console.log("Get response: " + gtresp.statusCode);
		
		var body = '';
		
		gtresp.setEncoding('utf8');
						
		gtresp.on('data', function(chunk) {
			body += chunk;
		});
		gtresp.on('end', function() {
			console.log("RESPONSE: " + body);
		
		});
	});	
	
}

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}


