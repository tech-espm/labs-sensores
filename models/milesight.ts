import app = require("teem");
import appsettings = require("../appsettings");
import mqtt = require("mqtt");
import DataUtil = require("../utils/dataUtil");
import Log = require("./log");

class Milesight {
	private static dataCliente: string | null = null;
	private static cliente: mqtt.MqttClient | null = null;
	private static statusCliente: string | null = null;
	private static ultimoErro: string | null = null;
	private static readonly timestampPorSensor = new Map<string, number>();
	private static readonly valorParaChecarPorSensor = new Map<string, number>();

	public static obterStatusHTML(): string {
		return `
<h1>Status Milesight</h1>
<p><b>Cliente:</b> ${(Milesight.cliente ? Milesight.dataCliente : "null")}</p>
<p><b>Status Cliente:</b> ${(Milesight.statusCliente || "")}</p>
<p><b>Último Erro:</b> ${(Milesight.ultimoErro || "")}</p>
`;
	}

	private static alterarStatus(status: string): void {
		Milesight.statusCliente = `${DataUtil.horarioDeBrasiliaISOComHorario()}: ${status}`;
	}

	private static alterarUltimoErro(erro: string): void {
		Milesight.ultimoErro = `${DataUtil.horarioDeBrasiliaISOComHorario()}: ${erro}`;
		console.error(`Milesight: ${Milesight.ultimoErro}`);
	}

	public static iniciar(): void {
		if (Milesight.cliente)
			return;

		Milesight.ultimoErro = null;
		Milesight.alterarStatus("Iniciando dados do banco...");

		app.sql.connect(async sql => {
			const sensores = ["soil01", "soil02", "odor01", "odor02", "presence01", "presence02", "presence03", "presence04", "presence05", "presence06", "presence07", "presence08", "magnetic01", "magnetic02", "magnetic03", "temperature01", "passage01", "passage02"];

			for (let i = sensores.length - 1; i >= 0; i--) {
				const sensor = sensores[i];
				const id_sensor = parseInt(sensor.substring(sensor.length - 1));

				let tabela: string;
				let campoParaChecar: string | null = null;

				switch (sensor) {
					case "soil01":
					case "soil02":
						tabela = "solo";
						break;

					case "odor01":
					case "odor02":
						tabela = "odor";
						break;

					case "presence01":
					case "presence02":
					case "presence03":
					case "presence04":
					case "presence05":
					case "presence06":
					case "presence07":
					case "presence08":
						tabela = "presenca";
						campoParaChecar = "ocupado";
						break;

					case "magnetic01":
					case "magnetic02":
					case "magnetic03":
						tabela = "abertura";
						campoParaChecar = "fechado";
						break;

					case "temperature01":
						tabela = "temperatura";
						break;

					default:
						tabela = "passagem";
						break;
				}

				const dados: any[] = await sql.query(`SELECT date_format(data, '%Y-%m-%d %H:%i:%s') data${(campoParaChecar ? (", " + campoParaChecar) : "")} FROM ${tabela} WHERE id_sensor = ? ORDER BY id DESC LIMIT 1`, [id_sensor]);
				if (!dados || !dados.length)
					continue;

				const dado = dados[0];

				Milesight.timestampPorSensor.set(sensor, (new Date(dado.data + " Z")).getTime());
				if (campoParaChecar)
					Milesight.valorParaChecarPorSensor.set(sensor, dado[campoParaChecar]);
			}
		}).then(() => {
			try {
				Milesight.ultimoErro = null;
				Milesight.alterarStatus("Conectando...");

				const c = mqtt.connect(appsettings.milesight.host, {
					clientId: appsettings.milesight.clientId,
					username: appsettings.milesight.user,
					password: appsettings.milesight.password,
					clean: true,
					resubscribe: false,
					reconnectPeriod: 1000,
					connectTimeout: 30 * 1000,
					keepalive: 30
				});

				Milesight.dataCliente = DataUtil.horarioDeBrasiliaISOComHorario();
				Milesight.cliente = c;

				c.on("connect", () => {
					if (Milesight.cliente !== c)
						return;

					Milesight.alterarStatus("Conectado!");

					c.subscribe("v3/espm/devices/+/up", { qos: 2 });
				});

				c.on("disconnect", () => {
					if (Milesight.cliente !== c)
						return;

					Milesight.alterarStatus("Desconectado");
				});

				c.on("reconnect", () => {
					if (Milesight.cliente !== c)
						return;

					Milesight.alterarStatus("Reconectando...");
				});

				c.on("close", () => {
					if (Milesight.cliente !== c)
						return;

					Milesight.alterarStatus("Terminado");
				});

				c.on("offline", () => {
					if (Milesight.cliente !== c)
						return;

					Milesight.alterarStatus("Offline");
				});

				c.on("erro", (error: Error) => {
					if (Milesight.cliente !== c)
						return;

					Milesight.alterarStatus("Erro");
					Milesight.alterarUltimoErro(error.message || error.toString());
				});

				c.on("message", (topic: string, payload: Buffer, packet: any) => {
					if (Milesight.cliente !== c || !payload)
						return;

					let mensagem: any;
					let json: string | null = null;
					try {
						mensagem = JSON.parse(json = payload.toString("utf8"));
					} catch (ex: any) {
						Milesight.alterarUltimoErro(`Erro ao decodificar payload (${topic}): ${(ex.message || ex.toString())} / ${json}`);
						return;
					}

					if (!mensagem) {
						Milesight.alterarUltimoErro(`Mensagem vazia (${topic})`);
						return;
					}

					if (!mensagem.end_device_ids ||
						!mensagem.end_device_ids.device_id ||
						!mensagem.uplink_message) {
						Milesight.alterarUltimoErro(`Mensagem com formato inválido (${topic}): ${json}`);
						return;
					}

					if (!mensagem.uplink_message.decoded_payload) {
						// Esse tipo de mensagem é bem comum... Não vamos marcar como erro.
						return;
					}

					const agora = DataUtil.horarioDeBrasiliaComoDateUTC();
					const agoraTimestamp = agora.getTime();

					const sensor: string = mensagem.end_device_ids.device_id;
					const id_sensor = parseInt(sensor.substring(sensor.length - 1));

					let tabela: string;
					let campos: string;
					let valores: string;
					let params: any[];

					if (!id_sensor) {
						Milesight.alterarUltimoErro(`Id de sensor inválido (${topic}): ${json}`);
						return;
					}

					switch (sensor) {
						case "soil01":
						case "soil02":
							tabela = "solo";
							campos = "condutividade, umidade, temperatura";
							valores = "?, ?, ?";
							params = [
								parseFloat(mensagem.uplink_message.decoded_payload.conductivity) || 0,
								parseFloat(mensagem.uplink_message.decoded_payload.humidity) || 0,
								parseFloat(mensagem.uplink_message.decoded_payload.temperature) || 0,
							];
							break;

						case "odor01":
						case "odor02":
							tabela = "odor";
							campos = "bateria, h2s, umidade, nh3, temperatura";
							valores = "?, ?, ?, ?, ?";
							params = [
								Math.max(0, Math.min(100, parseInt(mensagem.uplink_message.decoded_payload.battery) || 0)),
								parseFloat(mensagem.uplink_message.decoded_payload.h2s) || 0,
								parseFloat(mensagem.uplink_message.decoded_payload.humidity) || 0,
								parseFloat(mensagem.uplink_message.decoded_payload.nh3) || 0,
								parseFloat(mensagem.uplink_message.decoded_payload.temperature) || 0,
							];
							break;

						case "presence01":
						case "presence02":
						case "presence03":
						case "presence04":
						case "presence05":
						case "presence06":
						case "presence07":
						case "presence08":
							const ocupadoParaChecar = Milesight.valorParaChecarPorSensor.get(sensor);
							const ocupado = ((!mensagem.uplink_message.decoded_payload.occupancy || (mensagem.uplink_message.decoded_payload.occupancy == "vacant")) ? 0 : 1);
							if (ocupadoParaChecar === ocupado)
								return;

							Milesight.valorParaChecarPorSensor.set(sensor, ocupado);

							tabela = "presenca";
							campos = "bateria, ocupado";
							valores = "?, ?";
							params = [
								Math.max(0, Math.min(100, parseInt(mensagem.uplink_message.decoded_payload.battery) || 0)),
								ocupado,
							];
							break;

						case "magnetic01":
						case "magnetic02":
						case "magnetic03":
							const fechadoParaChecar = Milesight.valorParaChecarPorSensor.get(sensor);
							const fechado = ((mensagem.uplink_message.decoded_payload.door == "close") ? 1 : 0);
							if (fechadoParaChecar === fechado)
								return;

							Milesight.valorParaChecarPorSensor.set(sensor, fechado);

							tabela = "abertura";
							campos = "bateria, fechado, instalacao";
							valores = "?, ?, ?";
							params = [
								Math.max(0, Math.min(100, parseInt(mensagem.uplink_message.decoded_payload.battery) || 0)),
								fechado,
								(!mensagem.uplink_message.decoded_payload.install || (mensagem.uplink_message.decoded_payload.install == "no")) ? 0 : 1,
							];
							break;

						case "temperature01":
							tabela = "temperatura";
							campos = "umidade, temperatura";
							valores = "?, ?";
							params = [
								parseFloat(mensagem.uplink_message.decoded_payload.humidity) || 0,
								parseFloat(mensagem.uplink_message.decoded_payload.temperature) || 0,
							];
							break;

						case "passage01":
						case "passage02":
							tabela = "passagem";
							campos = "bateria, entrada, saida";
							valores = "?, ?, ?";
							params = [
								Math.max(0, Math.min(100, parseInt(mensagem.uplink_message.decoded_payload.battery) || 0)),
								Math.max(0, parseInt(mensagem.uplink_message.decoded_payload.period_in) || 0),
								Math.max(0, parseInt(mensagem.uplink_message.decoded_payload.period_out) || 0),
							];
							break;

						default:
							Milesight.alterarUltimoErro(`Id de sensor inválido (${topic}): ${json}`);
							return;
					}

					const timestamp = Milesight.timestampPorSensor.get(sensor);
					const delta = ((timestamp ? (agoraTimestamp - timestamp) : 0) / 1000) | 0;
					Milesight.timestampPorSensor.set(sensor, agoraTimestamp);

					Log.inserir({
						tabela,
						data: DataUtil.formatarDateUTCComHorario(agora),
						id_sensor,
						delta,
						campos,
						valores,
						params,
					});
				});
			} catch (ex: any) {
				Milesight.alterarUltimoErro(ex.message || ex.toString());
				Milesight.alterarStatus("Exceção");
			}
		}, reason => {
			Milesight.alterarUltimoErro("Exceção ao iniciar dados do banco: " + (reason.message || reason.toString()));
		});
	}
}

export = Milesight;
