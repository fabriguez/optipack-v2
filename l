a10768739f9de4e51d7b225b


ssh -i ~/.ssh/optipack-ci -L 4020:127.0.0.1:4020 brightky@opt-src
# Dans un autre terminal :
curl -s -X POST http://localhost:4020/ops/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@transitsoftservices.com","password":"a10768739f9de4e51d7b225b"}'
