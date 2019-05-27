# elblogs
gets Access Logs of given Amazon ELB

it uses user environment as aws credentials
`AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION` or `AWS_PROFILE`

## Install
`npm install -g elblogs`

## Usage 

`elblogs [accountId] [bucket] [lbName (--all for all)] [from ms|Date(ex: YYYY-MM-DDTHH:MM)] [to ms|Date(ex: YYYY-MM-DDTHH:MM) -optional]`

### Example
`$ elblogs 123456789012 elblogs-web --all 1h 30m` 
