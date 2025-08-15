const axios = require('axios');

async function main() {
    var options = {
        'method': 'POST',
        'url': 'https://aip.baidubce.com/rpc/2.0/tts/v1/create',
        'headers': {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer bce-v3/ALTAK-eoORIdLxZSbPyfUp0VXJg/6a8b496ba00b9ad2b7514987b8653a5d3f67ddb8'
        },
        body: JSON.stringify({
            "text": [
                "人生就像一场戏",
                "因为有缘才相聚",
                "相扶到老不容易",
                "是否更该去珍惜"
            ],
            "format": "mp3-16k",
            "voice": 0,
            "lang": "zh",
            "speed": 5,
            "pitch": 5,
            "volume": 5,
            "enable_subtitle": 0
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
    "text": [
        "人生就像一场戏",
        "因为有缘才相聚",
        "相扶到老不容易",
        "是否更该去珍惜"
    ],
        "format": "pcm-16k",
            "voice": 1,
                "lang": "zh"
}


Body返回示例：
创建成功
{
    "log_id": 1234567890,
        "task_id": "234acb234acb234acb234acb", #注意保存该id，用于后续请求结果
    "task_status": "Running"
}
创建失败，缺少参数
{
    "error_code": 100000,
        "error_msg": "missing param: xxx",
            "log_id": 5414433131138366128
}
