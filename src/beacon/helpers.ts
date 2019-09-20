import { networkInterfaces, NetworkInterfaceInfoIPv4, NetworkInterfaceInfoIPv6 } from 'os';

type NetworkInterfaceInfo = NetworkInterfaceInfoIPv4 | NetworkInterfaceInfoIPv6;

export function getInterfaces() {
  let ifaces = networkInterfaces();
  let result: NetworkInterfaceInfo[]  = [];
  Object.keys(ifaces).forEach((ifname) => {
    ifaces[ifname].forEach((iface) => {
      if (iface.internal !== false) {
        return;
      }

      result.push(iface);
    });
  });

  return result;
}
