import { Request } from 'express';

/**
 * 获取客户端真实IP地址
 * 支持多种网络环境：反向代理、Docker、云服务器等
 * 
 * @param req Express请求对象
 * @returns 客户端IP地址字符串
 */
export function getClientIP(req: Request): string {
  // 1. 优先检查 X-Forwarded-For 头（标准代理头）
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (forwarded as string).split(',').map(ip => ip.trim());
    // 第一个IP是原始客户端IP（后续是代理服务器IP）
    const clientIP = normalizeIP(ips[0]);
    if (clientIP && !isPrivateIP(clientIP)) {
      return clientIP;
    }
  }

  // 2. 检查 X-Real-IP 头（nginx常用）
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    const clientIP = normalizeIP(realIP as string);
    if (clientIP && !isPrivateIP(clientIP)) {
      return clientIP;
    }
  }

  // 3. 检查 X-Client-IP 头（Apache mod_proxy）
  const clientIPHeader = req.headers['x-client-ip'];
  if (clientIPHeader) {
    const clientIP = normalizeIP(clientIPHeader as string);
    if (clientIP && !isPrivateIP(clientIP)) {
      return clientIP;
    }
  }

  // 4. 使用Express的req.ip（配置trust proxy后会自动解析代理头）
  let ip = req.ip || req.socket.remoteAddress || 'unknown';
  
  // 5. 标准化IP格式
  ip = normalizeIP(ip);

  return ip || 'unknown';
}

/**
 * 标准化IP地址格式
 * 处理IPv6映射的IPv4地址、去除端口号等
 * 
 * @param ip 原始IP地址
 * @returns 标准化后的IP地址
 */
export function normalizeIP(ip: string): string {
  if (!ip || ip === 'unknown') {
    return 'unknown';
  }

  // 移除IPv6映射的IPv4地址前缀 (::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // 移除IPv6简写 (::1 -> 127.0.0.1)
  if (ip === '::1') {
    ip = '127.0.0.1';
  }

  // 去除端口号 (192.168.1.1:3000 -> 192.168.1.1)
  const colonIndex = ip.lastIndexOf(':');
  if (colonIndex > 0 && ip.indexOf('.') !== -1) {
    // 确保不是IPv6地址（IPv6包含多个冒号）
    const colonCount = (ip.match(/:/g) || []).length;
    if (colonCount === 1) {
      ip = ip.substring(0, colonIndex);
    }
  }

  return ip.trim();
}

/**
 * 判断是否为私有IP地址
 * 用于过滤内网IP，优先返回公网IP
 * 
 * @param ip IP地址
 * @returns 是否为私有IP
 */
export function isPrivateIP(ip: string): boolean {
  if (!ip || ip === 'unknown') {
    return true;
  }

  // IPv4私有地址范围
  const privateRanges = [
    /^127\./,                    // 127.0.0.0/8 (回环地址)
    /^10\./,                     // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,               // 192.168.0.0/16
    /^169\.254\./,               // 169.254.0.0/16 (链路本地地址)
    /^0\./,                      // 0.0.0.0/8
  ];

  return privateRanges.some(range => range.test(ip));
}

/**
 * 获取客户端IP的详细信息
 * 用于调试和日志记录
 * 
 * @param req Express请求对象
 * @returns IP获取的详细信息
 */
export function getIPDetails(req: Request) {
  return {
    clientIP: getClientIP(req),
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'x-client-ip': req.headers['x-client-ip'],
    },
    expressIP: req.ip,
    socketIP: (req.socket as any)?.remoteAddress,
  };
}