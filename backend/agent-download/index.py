"""
Business: Собирает ZIP с Windows-агентом и публикует в S3, возвращает CDN-ссылку.
Args: event с httpMethod GET; context с request_id
Returns: JSON {success, url}
"""

import io
import json
import os
import zipfile
import boto3

from agent_files import AGENT_FILES


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }


def handler(event: dict, context) -> dict:
    """Сборка и публикация ZIP с агентом"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name, content in AGENT_FILES.items():
            zf.writestr(f"network-agent/{name}", content)
    buf.seek(0)

    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    key = 'agent/network-agent.zip'
    s3.put_object(
        Bucket='files',
        Key=key,
        Body=buf.getvalue(),
        ContentType='application/zip',
        ContentDisposition='attachment; filename="network-agent.zip"',
    )
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

    return {
        'statusCode': 200,
        'headers': cors_headers(),
        'body': json.dumps({
            'success': True,
            'url': cdn_url,
            'size': len(buf.getvalue()),
            'files': list(AGENT_FILES.keys()),
        }),
    }
