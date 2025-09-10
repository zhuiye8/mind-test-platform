# 模型模块初始化文件

# 在模块加载时设置DeepFace路径到项目目录
import os
from pathlib import Path

# 设置DeepFace模型路径到项目目录
project_root = Path(__file__).parent.parent  # emotion项目根目录
deepface_home = project_root / "models" / "deepface_models"
deepface_home.mkdir(parents=True, exist_ok=True)
os.environ['DEEPFACE_HOME'] = str(deepface_home.absolute())

# 确保在任何DeepFace导入之前设置路径
print(f"[模型初始化] DeepFace模型路径已设置为: {deepface_home.absolute()}")
