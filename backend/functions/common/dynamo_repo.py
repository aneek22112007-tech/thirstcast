import os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal
from typing import List, Dict, Optional

class DynamoRepo:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.climatology_table = self.dynamodb.Table(os.environ['CLIMATOLOGY_TABLE'])
        self.config_table = self.dynamodb.Table(os.environ['CONFIG_TABLE'])
        self.status_table = self.dynamodb.Table(os.environ['STATUS_TABLE'])

    def _replace_decimals(self, obj):
        if isinstance(obj, list):
            return [self._replace_decimals(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._replace_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return obj

    def _to_decimal(self, obj):
        if isinstance(obj, list):
            return [self._to_decimal(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._to_decimal(v) for k, v in obj.items()}
        elif isinstance(obj, float):
            return Decimal(str(obj))
        return obj

    def get_climatology(self, district: str) -> List[Dict]:
        response = self.climatology_table.query(
            KeyConditionExpression=Key('district').eq(district)
        )
        return self._replace_decimals(response.get('Items', []))

    def get_config(self) -> Dict:
        response = self.config_table.scan()
        items = self._replace_decimals(response.get('Items', []))
        config = {}
        for item in items:
            config[item['pk']] = item
        return config

    def get_status(self, district: str) -> Optional[Dict]:
        response = self.status_table.get_item(
            Key={'district': district}
        )
        item = response.get('Item')
        return self._replace_decimals(item) if item else None

    def put_status(self, item: Dict) -> None:
        self.status_table.put_item(Item=self._to_decimal(item))
