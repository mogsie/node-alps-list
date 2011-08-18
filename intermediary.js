var http = require('http'),
url = require('url'),
journey = require('journey'),
files = require('node-static'),
cradle = require('cradle'),
jsdom = require('jsdom@0.2.0'), // for newer installs, replace with require("jsdom");
$ = require('jquery');

var fileServer = new (files.Server)(),
db = new(cradle.Connection)({cache: false}).database('proxy'),
port = 9876;
server;


/*
 * Router:
 * /static/ -- files in ./static
 * /proxy/documentid/ the proxy document...
 */


var  router = function () {

  var r = new (journey.Router);
  r.map(function () {

    this.root.bind(function (request, response) { 
        response.send(200, "text/plain", "Hello, world");
    });

    this.path('/proxy', function () { // some fake data base calls...

      this.root.bind(function(request, response, query) {
        console.log('proxying ' + query);
        response.send(200, { "Content-Type":"text/plain; charset=UTF-8"}, "Proxying something... ");
      });

      //  /proxy/{id}
      this.path(/([-a-zA-Z0-9]*)/, function() {

	// Render the entire calendar
	// /proxy/{id}/
        this.root.bind(function (request, response, id) {
          db.get(id, function(err,doc) {
            if (err) {
              response.send(200, { "Content-Type":"text/html; charset=UTF-8"}, "An error occurred.  Go elsewhere.  <a href='foobar'>/</a>");
              return;
            }
            var tweets = [];
            var outstanding = doc.urls.length;
            var EventEmitter= require('events').EventEmitter;
            var responseHandler = new EventEmitter();

            // a chain of events, starting with the 'complete' event:
            responseHandler.on('complete', function(data) {
              jsdom.env({
                html: data
              }, function(errors, window) {
                console.log("Got a page from a backend");
                $('#messages>ul>li', window.document).each(function(index, item) {
                  // TODO absolutify URIs
                  tweets.push({
                    "text":$('.message-text', item).text(),
                    "url":$('a[rel="message"]', item).attr('href'),
                    "useruri":$('a[rel="user"]', item).attr('href'),
                    "datetime":$('span.date-time', item).text(),
                    "usertext":$('span.user-text', item).text()
                  });
                });
                if (outstanding == 0) {
                  responseHandler.emit('render');
                }
              });
            });

 /*
<span class="message-text">   bang bang bang </span> 
<span class="single">@</span>
<a rel="message" href="http://.../microblog/messages/c4f2723abd15ef822f95598445defbb9" title="message"> 
  <span class="date-time"> 2011-08-18 14:30:33 </span> 
</a> 
<span class="single">by</span> 
<a rel="user" href="http://.../microblog/users/KevBurnsJr" title="KevBurnsJr"> 
  <span class="user-text">KevBurnsJr</span> 
</a> 
*/
            // 'render' event triggered when all 'complete' events are done.
            responseHandler.on('render', function() {
              console.log('All responses came back: ' + tweets.length + ' tweets');

              // sorting tweets by date, newest first.
              tweets.sort(function compare(a,b) {
                if (a.datetime < b.datetime)
                  return 1;
                if (a.datetime> b.datetime)
                  return -1;
                return 0;
              });

              jsdom.env({
                  html: 'microblog.html'
                }, function(errors, window) {
                  $('h1', window.document).text(doc.title);
                  var list = $('ul', window.document);
                  var item = $('li', window.document).detach();
                  for (var i = 0; i < tweets.length; i++) {
                    var newitem = item.clone();
                    newitem.appendTo(list);
                    $('.message-text',newitem).text(tweets[i].text);
                    $('.user-text',newitem).text(tweets[i].usertext);
                    $('.date-time',newitem).text(tweets[i].datetime);
                    $('a[rel="message"]',newitem).attr("href", tweets[i].url);
                    $('a[rel="user"]',newitem).attr("href", tweets[i].useruri);
                  };
                  response.send(200, { "Content-Type":"text/html; charset=UTF-8"}, window.document.innerHTML);
                }
              );
            });
            for (var i = 0; i < doc.urls.length; i++) {
              http.get(doc.urls[i], function(res2) {
                var data = "";
                res2.on('data', function (chunk) {
                  data = data + chunk
                });
                res2.on('close', function(chunk) {
                  outstanding--;
                  responseHandler.emit('complete');
                });
                res2.on('end', function(chunk) {
                  outstanding--;
                  if (res2.statusCode == 200) {
                    responseHandler.emit('complete', data);
                  }
                });
              });
            }
           
          });
        });


      });


    });
  });
  return r;
};

var r = router();
var server = http.createServer(function (req, res) {

  var body = '';

  // Append the chunk to body
  req.addListener('data', function (chunk) { 
    body += chunk; 
  });

  req.addListener('end', function () {
    var uri = url.parse(req.url);
    if (uri.pathname.slice(1).split('/')[0] == 'static') {
      console.log('serving file ' + uri.pathname);
      fileServer.serve(req, res);
    }
    else {
      
//      httpdigest.http_digest_auth(req, res, "abc", "abc", function() {
      console.log('routing file ' + uri.pathname);
      r.handle(req, body, function (result) {
          console.log("result was " + result.status + ", " + result.body.length + " bytes" );
          res.writeHead(result.status, result.headers);
          res.end(result.body);
      });
    }
  });
});

if (port) server.listen(port);
console.log("Demo is running on port "+port);







