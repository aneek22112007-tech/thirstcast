import argparse
import json
import boto3
from decimal import Decimal

def _to_decimal(obj):
    if isinstance(obj, list):
        return [_to_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--table', required=True)
    parser.add_argument('--file', required=True)
    parser.add_argument('--profile', required=True)
    args = parser.parse_args()

    session = boto3.Session(profile_name=args.profile)
    dynamodb = session.resource('dynamodb')
    table = dynamodb.Table(args.table)

    with open(args.file, 'r') as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("Error: JSON file must contain a list of items.")
        return

    items = _to_decimal(data)
    
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)
            
    print(f"Loaded {len(items)} items into {args.table}.")

if __name__ == '__main__':
    main()
