var aws = require('aws-sdk')
  , ms = require('ms')
  , moment = require('moment')
  , async = require('async')
  , fs = require('fs')
  , conf = require('./conf.json')
  , now = +moment()
  , argv = process.argv.slice(2);

require('moment-range');

aws.config.update(conf.aws);

if (argv.length < 2) {
  console.log('usage: [lbName (--all for all)] [from ms|Date(ex: YYYY-MM-DDTHH:MM)] [to ms|Date(ex: YYYY-MM-DDTHH:MM) -optional]');
  process.exit();
}

var lbName = argv[0]
  , from = now - ( ms(argv[1]) || moment().diff(argv[1]) )
  , to = now - (argv[2] ? ms(argv[2]) ? ms(argv[2]) : moment().diff(argv[2]) : 0);

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
      Bucket: conf.bucket,
      Prefix: ['AWSLogs', conf.aws.accountId, 'elasticloadbalancing', conf.aws.region, i.format('YYYY/MM/DD/')].join('/')
    };

    (function list (next, attr) {
      s3.listObjects(attr,
        function (err, data) {
          if (err) return setImmediate(next);

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
        Bucket: conf.bucket,
        Key: key
      }, function (err, data) {
        if (err) return setImmediate(next);
        var filename = key.replace(/\//g, '_');

        fs.writeFile('./logs/' + filename, data.Body, function (err, data) {
          if (err) return setImmediate(next);
          next()
        });
      })
    })
  });
