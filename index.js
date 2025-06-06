#!/usr/bin/env node

var ms = require('ms')
  , moment = require('moment')
  , async = require('async')
  , fs = require('fs')
  , now = +moment()
  , argv = process.argv.slice(2);

const {
  S3
} = require("@aws-sdk/client-s3");

const { fromEnv } = require("@aws-sdk/credential-providers");

require('moment-range');

if (argv.length < 4) {
  console.log('usage: [accountId] [bucket] [lbName (--all for all)] [from ms|Date(ex: YYYY-MM-DDTHH:MM)] [to ms|Date(ex: YYYY-MM-DDTHH:MM) -optional]');
  process.exit();
}

var accountId = argv[0]
  , bucket = argv[1]
  , lbName = argv[2]
  , from = now - ( ms(argv[3]) || moment().diff(argv[3]) )
  , to = now - (argv[4] ? ms(argv[4]) ? ms(argv[4]) : moment().diff(argv[4]) : 0);
var bucketPrefix = "";

if (bucket.includes("/")) {
  [bucket, bucketPrefix] = bucket.split("/", 2);
}

var fromDate = moment(from)
  , toDate = moment(to);

if (!( fromDate.isValid() && toDate.isValid && (toDate > fromDate)  )) {
  console.log('given dates (${fromDate} - ${toDate}) are not valid');
  process.exit();
}
console.log('dates are valid: ', fromDate.utc(), toDate.utc());

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
      if (fs.statSync(filePath).isFile() && files[i] !== '.gitignore')
        fs.unlinkSync(filePath);
      else if (fs.statSync(filePath).isDirectory())
        rmDir(filePath);
    }
  })('./logs');

var range = moment.range(fromDate, toDate);

var days = []
  , keys = [];

range.by('days', function (m) {
  days.push(m);
});

const region = process.env.AWS_DEFAULT_REGION;
const s3 = new S3({region, credentials: fromEnv()});

async.each(days, function (i, next) {
    console.log('processing', i.format('YYYY/MM/DD'));
    var parts = [bucketPrefix, 'AWSLogs', accountId, 'elasticloadbalancing', region, i.format('YYYY/MM/DD/')];
    if (!bucketPrefix) {
      parts.shift();
    }
    var attr = {
      Bucket: bucket,
      Prefix: parts.join('/')
    };

    (function list (next, attr) {
      console.log('listing', attr.Bucket, attr.Prefix);
      s3.listObjects(attr,
        function (err, data) {
          if (err || !data) return setImmediate(next, err || new Error('No data'));

          var contents = data.Contents || []
            , lastItem = contents.length - 1;
          console.log('got', contents.length, 'objects');
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
    console.log('processing keys', keys.length);
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

      console.log('found logfile', key);

      s3.getObject({
        Bucket: bucket,
        Key: key
      }, function (err, data) {
        if (err) return setImmediate(next || new Error("No data"));
        var filename = key.replace(/\//g, '_');

        (async () => {
          const body = await data.Body.transformToByteArray();
          fs.writeFile('./logs/' + filename, new Buffer.from(body), function (err, data) {
            if (err) return setImmediate(next,err);
            next()
          });
        })();
      })
    })
  });
