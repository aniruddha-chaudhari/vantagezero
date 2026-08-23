export interface CatalogCandidate {
  mpn: string;
  category: string;
  /** Used only to decide whether to also resolve an ST lifecycle source - not trusted data. */
  manufacturerHint?: "STMicroelectronics";
}

/**
 * Curated for category spread (master-plan §6) plus a few parts prone to real shortages,
 * so a judge's BOM can surface a bottleneck that isn't the hero STM32F407VGT6.
 */
export const CATALOG_CANDIDATES: CatalogCandidate[] = [
  { mpn: "STM32F103C8T6", category: "MCU", manufacturerHint: "STMicroelectronics" },
  { mpn: "ATMEGA328P-PU", category: "MCU" },
  { mpn: "ESP32-WROOM-32E", category: "MCU" },
  { mpn: "LD1117S33TR", category: "regulator", manufacturerHint: "STMicroelectronics" },
  { mpn: "LM2596S-ADJ", category: "regulator" },
  { mpn: "TPS54331DR", category: "PMIC" },
  { mpn: "LAN8720A-CP", category: "PHY" },
  { mpn: "W25Q32JVSSIQ", category: "memory" },
  { mpn: "24LC256-I/SN", category: "memory" },
  { mpn: "SN65HVD230DR", category: "transceiver" },
  { mpn: "MAX3232IDR", category: "transceiver" },
  { mpn: "USB4105-GF-A", category: "connector" },
  { mpn: "22-23-2021", category: "connector" },
  { mpn: "ABM8-16.000MHZ-B2-T", category: "crystal" },
  { mpn: "BME280", category: "sensor" },
  { mpn: "PESD5V0S1BA,215", category: "protection" },
  { mpn: "NE555P", category: "timer" },
  { mpn: "L7805CV", category: "regulator", manufacturerHint: "STMicroelectronics" },
  { mpn: "TL072CP", category: "op-amp" },
  { mpn: "ULN2003AN", category: "driver" },
  { mpn: "IRLZ44NPBF", category: "mosfet" },
  { mpn: "MCP2515-I/SO", category: "CAN controller" },
  { mpn: "FT232RL", category: "USB-UART" },
  { mpn: "DS18B20", category: "sensor" },
  { mpn: "PCA9685PW", category: "PWM driver" },
  { mpn: "MAX7219CNG", category: "LED driver" },
  { mpn: "ADS1115IDGSR", category: "ADC" },
  { mpn: "INA219AIDCNR", category: "current sensor" },
  { mpn: "AT24C256C-SSHM-T", category: "memory" },
  { mpn: "MCP4725A0T-E/CH", category: "DAC" },
  { mpn: "SMAJ5.0A-13-F", category: "protection" },
];
