#!/usr/bin/env node

var aws = require('aws-sdk')
  , ms = require('ms')
  , moment = require('moment')
  , async = require('async')
  , fs = require('fs')
  , now = +moment()
  , argv = process.argv.slice(2);

var config = {accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, region: process.env.AWS_DEFAULT_REGION};

require('moment-range');

aws.config.update(config);

if (argv.length < 4) {
  console.log('usage: [accountId] [bucket] [lbName (--all for all)] [from ms|Date(ex: YYYY-MM-DDTHH:MM)] [to ms|Date(ex: YYYY-MM-DDTHH:MM) -optional]');
  process.exit();
}

var accountId = argv[0]
  , bucket = argv[1]
  , lbName = argv[2]
  , from = now - ( ms(argv[3]) || moment().diff(argv[3]) )
  , to = now - (argv[4] ? ms(argv[4]) ? ms(argv[4]) : moment().diff(argv[4]) : 0);

var fromDate = moment(from)
  , toDate = moment(to);

if (!( fromDate.isValid() && toDate.isValid && (toDate > fromDate)  )) {
  console.log('given dates are not valid');
  process.exit();
}


(function rmDir (dirPath) {
  try {
    var files = fs.readdirSync(dirPath);
  }
  catch(e) {
    fs.mkdirSync(dirPath);
    return;
  }
  if (files.length > 0)
    for(var i = 0; i < files.length; i++) {
      var filePath = dirPath + '/' + files[i];
      if (fs.statSync(filePath).isFile())
        fs.unlinkSync(filePath);
      else
        rmDir(filePath);
    }
})('./logs');

var range = moment.range(fromDate, toDate);

var days = []
  , keys = [];

range.by('days', function (m) {
  days.push(m);
});

var s3 = new aws.S3();

async.each(days, function (i, next) {
    var attr = {
      Bucket: bucket,
      Prefix: ['AWSLogs', accountId, 'elasticloadbalancing', config.region, i.format('YYYY/MM/DD/')].join('/')
    };

    (function list (next, attr) {
      s3.listObjects(attr,
        function (err, data) {
          if (err || !data) return setImmediate(next, err || new Error('No data'));

          var contents = data.Contents || []
            , lastItem = contents.length - 1;

          for(var i = 0; i < contents.length; i++) {
            keys.push(contents[i]);

            if (i == lastItem) {
              attr.Marker = contents[i].Key;
              return list(next, attr)
            }
            attr.Marker = null;
          }
          next()
        }
      )
    })(next, attr)
  },
  function () {
    async.each(keys, function (k, next) {
      var key = k.Key;

      if (lbName != '--all') {
        var nameMatch = key.match(new RegExp('_' + lbName + '_', 'g'));
        if (!nameMatch) return next();
      }

      var match = key.match(/_([0-9T]+)/);
      if (!match[1]) return next();

      var date = moment.utc(match[1], 'YYYYMMDDHHmm');
      if (!date.isValid() || !range.contains(date)) return next();

      s3.getObject({
        Bucket: bucket,
        Key: key
      }, function (err, data) {
        if (err) return setImmediate(next || new Error("No data"));
        var filename = key.replace(/\//g, '_');

        fs.writeFile('./logs/' + filename, data.Body, function (err, data) {
          if (err) return setImmediate(next,err);
          next()
        });
      })
    })
  });
