// 设备检测类型定义（接口层统一使用 snake_case，前端内部可 camelCase）

export interface DeviceCheckResults {
  // 是否检测通过（摄像头/麦克风独立判断）
  camera_ok: boolean;
  microphone_ok: boolean;

  // 选中的设备信息（便于后续调试或上报）
  selected_camera_id?: string;
  selected_camera_label?: string;
  selected_microphone_id?: string;
  selected_microphone_label?: string;

  // 运行时信息
  constraints_used?: Record<string, any>;
  skipped?: boolean;
}

export interface DeviceCheckPageProps {
  onComplete: (results: DeviceCheckResults) => void;
  onSkip?: () => void;
}

