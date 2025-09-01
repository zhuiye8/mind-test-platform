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
      message={error ? '设备检测出现问题' : '隐私与提示'}
      description={
        <div>
          {error && <Paragraph style={{ marginBottom: 8 }}><Text type="danger">{error}</Text></Paragraph>}
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>不会录制任何音视频内容，仅用于确认设备是否可用</li>
            <li>若摄像头画面黑屏：请检查是否被其他软件占用，或在系统隐私设置中允许浏览器访问</li>
            <li>若使用虚拟摄像头（如 OBS），请确保其已开启推流</li>
            <li>如问题仍在，尝试更换设备、浏览器或点击下方“重新检测”</li>
          </ul>
        </div>
      }
    />
  );
};

export default TroubleshootTips;

