const axios = require('axios');

async function main() {
    var options = {
        'method': 'POST',
        'url': 'https://aip.baidubce.com/rpc/2.0/tts/v1/query',
        'headers': {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer bce-v3/ALTAK-eoORIdLxZSbPyfUp0VXJg/6a8b496ba00b9ad2b7514987b8653a5d3f67ddb8'
        },
        body: JSON.stringify({
                "task_ids": [
                        "111111"
                ]
        })

    };

    axios(options)
        .then(response => {
            console.log(response.data);
        })
        .catch(error => {
            throw new Error(error);
        })
}

main();

Body请求示例：
{
    "task_ids":  ["234acb234acb234acb234acb", "234acb234acb234acb234acd", "234acb234acb234acb234acbe"]
}


Body返回示例：
{
    "log_id": 12345678,
    "tasks_info": [
        { # 合成中
            "task_id": "234acb234acb234acb234acb",
            "task_status": "Running"
        },
        { # 合成失败
            "task_id": "234acb234acb234acb234acd",
            "task_status": "Failure"
            "task_result": {
                "err_no":  3301
                "err_msg": "speech quality error",
                "sn": "xxx"
            }
        },
        { # 合成成功
            "task_id": "234acb234acb234acb234ace",
            "task_result": {
                "speech_url": "https://bos.xxxxxxxxxxxxxx"
            },
            "task_status": "Success"
        }
    ]
}
