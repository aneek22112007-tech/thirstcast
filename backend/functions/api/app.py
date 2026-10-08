import json

def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({
            "districts": [
                {"id": "Bengaluru_Urban"},
                {"id": "Kolar"},
                {"id": "Mandya"}
            ]
        })
    }
