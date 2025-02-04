-- Esse script vale para o MySQL 8.x. Se seu MySQL for 5.x, precisa executar essa linha comentada:
-- CREATE DATABASE IF NOT EXISTS sensores;
CREATE DATABASE IF NOT EXISTS sensores DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- Todos os deltas estão em segundos

USE sensores;

-- Sensores Steinel

-- Cada uma das 8 zonas (0 ... 7) será mapeada como um id_sensor (1 ... 8)
-- topic espm/stainel/hpd/DetectedPersonsZone
-- {"DetectedPersonsZone":[0,0,2,1,1,0,1,0]}
-- topic espm/stainel/hpd/LuxZone
-- {"LuxZone":[70.00,78.00,74.00,87.00,67.00,57.00,50.00,53.00]}
-- topic espm/stainel/hpd/Humidity
-- {"Humidity":67.00}
-- topic espm/stainel/hpd/Temperature
-- {"Temperature":24.30}
CREATE TABLE pca (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL, -- O campo delta diz respeito a alterações no valor de pessoas
  pessoas tinyint NOT NULL,
  luminosidade float NOT NULL,
  umidade float NOT NULL,
  temperatura float NOT NULL,
  PRIMARY KEY (id),
  KEY pca_data_id_sensor (data, id_sensor),
  KEY pca_id_sensor (id_sensor)
);

-- Sensores Milesight

-- O timestamp foi removido do banco porque ele não seguia um padrão crescente quando recebido dos sensores

-- topic v3/espm/devices/soil01/up
-- topic v3/espm/devices/soil02/up
-- { "end_device_ids": { "device_id": "soil01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload" : { "conductivity": 114, "humidity": 24.5, "temperature": 23.2 } } }
CREATE TABLE solo (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  condutividade float NOT NULL,
  umidade float NOT NULL,
  temperatura float NOT NULL,
  PRIMARY KEY (id),
  KEY solo_data_id_sensor (data, id_sensor),
  KEY solo_id_sensor (id_sensor)
);

-- topic v3/espm/devices/odor01/up
-- topic v3/espm/devices/odor02/up
-- { "end_device_ids": { "device_id": "odor01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload": { "battery": 99, "h2s": 0.02, "humidity": 78, "nh3": 0.01, "temperature": 24.3 } } }
CREATE TABLE odor (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  bateria tinyint NOT NULL,
  h2s float NOT NULL,
  umidade float NOT NULL,
  nh3 float NOT NULL,
  temperatura float NOT NULL,
  PRIMARY KEY (id),
  KEY odor_data_id_sensor (data, id_sensor),
  KEY odor_id_sensor (id_sensor)
);

-- topic v3/espm/devices/presence01/up
-- topic v3/espm/devices/presence02/up
-- topic v3/espm/devices/presence03/up
-- topic v3/espm/devices/presence04/up
-- topic v3/espm/devices/presence05/up
-- topic v3/espm/devices/presence06/up
-- topic v3/espm/devices/presence07/up
-- topic v3/espm/devices/presence08/up
-- { "end_device_ids": { "device_id": "presence01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload": { "battery": 99, "occupancy": "vacant" } } }
CREATE TABLE presenca (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  bateria tinyint NOT NULL,
  ocupado tinyint NOT NULL,
  PRIMARY KEY (id),
  KEY presenca_data_id_sensor (data, id_sensor),
  KEY presenca_id_sensor (id_sensor)
);

-- topic v3/espm/devices/magnetic01/up
-- topic v3/espm/devices/magnetic02/up
-- topic v3/espm/devices/magnetic03/up
-- { "end_device_ids": { "device_id": "magnetic01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload": { "battery": 87, "door": "close", "install": "no" } } }
CREATE TABLE abertura (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  bateria tinyint NOT NULL,
  fechado tinyint NOT NULL,
  instalacao tinyint NOT NULL,
  PRIMARY KEY (id),
  KEY abertura_data_id_sensor (data, id_sensor),
  KEY abertura_id_sensor (id_sensor)
);

-- topic v3/espm/devices/temperature01/up
-- { "end_device_ids": { "device_id": "temperature01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload": { "humidity": 82, "temperature": 23.4 } } }
CREATE TABLE temperatura (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  umidade float NOT NULL,
  temperatura float NOT NULL,
  PRIMARY KEY (id),
  KEY temperatura_data_id_sensor (data, id_sensor),
  KEY temperatura_id_sensor (id_sensor)
);

-- topic v3/espm/devices/passage01/up
-- topic v3/espm/devices/passage02/up
-- { "end_device_ids": { "device_id": "passage01" }, "uplink_message": { "rx_metadata": [{ "timestamp": 2040934975 }], "decoded_payload": { "battery": 0, "period_in": 0, "period_out": 0 } } }
CREATE TABLE passagem (
  id bigint NOT NULL AUTO_INCREMENT,
  data datetime NOT NULL,
  id_sensor tinyint NOT NULL,
  delta int NOT NULL,
  bateria tinyint NOT NULL,
  entrada int NOT NULL,
  saida int NOT NULL,
  PRIMARY KEY (id),
  KEY passagem_data_id_sensor (data, id_sensor),
  KEY passagem_id_sensor (id_sensor)
);
