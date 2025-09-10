import React from 'react';
import { Alert, Typography } from 'antd';

const { Paragraph, Text } = Typography;

interface Props {
  error?: string | null;
}

const TroubleshootTips: React.FC<Props> = ({ error }) => {
  return (
    <Alert
      type={error ? 'error' : 'info'}
      showIcon
      message={error ? '设备连接出现问题' : '隐私与提示'}
      description={
        <div>
          {error && <Paragraph style={{ marginBottom: 8 }}><Text type="danger">{error}</Text></Paragraph>}
          
          {error ? (
            // 出现错误时显示针对性解决方案
            <div>
              <Paragraph><Text strong>常见解决方案：</Text></Paragraph>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                <li><strong>设备被占用</strong>：关闭QQ、微信、腾讯会议、OBS、Skype等可能使用摄像头的程序</li>
                <li><strong>权限问题</strong>：刷新页面重新授权，或在浏览器设置中允许摄像头/麦克风访问</li>
                <li><strong>驱动问题</strong>：在Windows设备管理器中检查音频/视频设备状态</li>
                <li><strong>虚拟摄像头</strong>：确保OBS等虚拟摄像头软件已正确启动</li>
                <li><strong>浏览器兼容</strong>：推荐使用最新版Chrome或Edge浏览器</li>
              </ul>
            </div>
          ) : (
            // 正常状态显示隐私提示
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>🔒 不会录制任何音视频内容，仅用于确认设备是否可用</li>
              <li>📹 请确保摄像头画面清晰可见</li>
              <li>🎤 请对着麦克风说话，确认音量检测正常</li>
              <li>✅ 确认无误后点击"确认连接正常，保持连接"按钮</li>
            </ul>
          )}
        </div>
      }
    />
  );
};

export default TroubleshootTips;

