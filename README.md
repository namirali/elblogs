# elb-logs
gets Access Logs of given load balancer

###usage
`node index.js [lbName (--all for all)] [from ms|Date(ex: YYYY-MM-DDTHH:MM)] [to ms|Date(ex: YYYY-MM-DDTHH:MM) -optional]`
###config
`./config.json`
````
{
  "aws": {
    "accountId": "", // The AWS account number associated with the load balancer
    "accessKeyId": "",
    "secretAccessKey": "",
    "region": ""
  },
  "bucket": "" // Name of bucket where logs are stored
}

````
