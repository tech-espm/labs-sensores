import app = require("teem");
import appsettings = require("../appsettings");
import mqtt = require("mqtt");
import DataUtil = require("../utils/dataUtil");

class Milesight {
	private static dataCliente: string | null = null;
	private static cliente: mqtt.MqttClient | null = null;
	private static statusCliente: string | null = null;
	private static ultimoErro: string | null = null;
	private static fila: any[] = [];
	private static inserindo = false;

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

	private static inserir() {
		if (Milesight.inserindo)
			return;

		Milesight.inserindo = true;
		app.sql.connect(async sql => {
			do {
				const dados = Milesight.fila.shift();
				if (!dados)
					break;

				try {
					const agora: string = dados.agora;
					const tabela: string = dados.tabela;
					const campos: string = dados.campos;
					const valores: string = dados.valores;
					const campoParaChecar: string | null = dados.campoParaChecar;
					const valorParaChecar: number = dados.valorParaChecar;
					const params: any[] = dados.params;
					const id_sensor: number = dados.id_sensor;
					// Deixa o timestamp em milissegundos
					const timestamp: number = (dados.timestamp / 1000) | 0;
					let delta = 0;

					const lista: any[] = await sql.query(`SELECT timestamp${(campoParaChecar ? ", " + campoParaChecar : "")} FROM ${tabela} WHERE id_sensor = ? ORDER BY id DESC LIMIT 1`, [id_sensor]);
					if (lista && lista[0]) {
						delta = timestamp - lista[0].timestamp;
						if (delta <= 0) {
							Milesight.alterarUltimoErro(`Timestamp fora de ordem: ${lista[0].timestamp} / ${timestamp} / ${tabela} / ${id_sensor}`);
							continue;
						}

						// Armazena o delta em segundos
						delta = (delta / 1000) | 0;

						if (campoParaChecar) {
							// Se o dado de presença, por exemplo, não foi alterado, ignora
							if (lista[0][campoParaChecar] === valorParaChecar)
								continue;
						}
					}

					await sql.query(`INSERT INTO ${tabela} (data, id_sensor, timestamp, delta, ${campos}) VALUES (?, ?, ?, ?, ${valores})`, [agora, id_sensor, timestamp, delta, ...params]);
				} catch (ex: any) {
					Milesight.inserindo = false;
					Milesight.alterarUltimoErro(`Erro de banco de dados: ${ex.message || ex.toString()}`);
				}
			} while (Milesight.fila.length);

			Milesight.inserindo = false;
		}).catch(reason => {
			Milesight.inserindo = false;
			Milesight.alterarUltimoErro(`Erro de banco de dados: ${reason.message || reason.toString()}`);
		});
	}

	public static iniciar(): void {
		if (Milesight.cliente)
			return;
		try {
			Milesight.ultimoErro = null;
			Milesight.alterarStatus("Conectando...");

			const c = mqtt.connect(appsettings.milesight.host, {
				clientId: appsettings.milesight.clientId,
				username: appsettings.milesight.user,
				password: appsettings.milesight.password,
				clean: true,
				reconnectPeriod: 1000,
				connectTimeout: 30 * 1000,
				keepalive: 30
			});

			Milesight.dataCliente = DataUtil.horarioDeBrasiliaISOComHorario();
			Milesight.cliente = c;

			c.on("connect", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Conectado!");

				c.subscribe("v3/espm/devices/+/up");
			});

			c.on("disconnect", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Desconectado");
			});

			c.on("reconnect", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Reconectando...");
			});

			c.on("close", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Terminado");
			});

			c.on("offline", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Offline");
			});

			c.on("erro", function (error: Error) {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Erro");
				Milesight.alterarUltimoErro(error.message || error.toString());
			});

			c.on("message", function (topic: string, payload: Buffer, packet: any) {
				if (Milesight.cliente !== c || !payload)
					return;

				const agora = DataUtil.horarioDeBrasiliaISOComHorario();

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
					!mensagem.uplink_message ||
					!mensagem.uplink_message.rx_metadata ||
					!mensagem.uplink_message.rx_metadata.length ||
					!mensagem.uplink_message.rx_metadata[0] ||
					!mensagem.uplink_message.rx_metadata[0].timestamp) {
					Milesight.alterarUltimoErro(`Mensagem com formato inválido (${topic}): ${json}`);
					return;
				}

				if (!mensagem.uplink_message.decoded_payload) {
					// Esse tipo de mensagem é bem comum... Não vamos marcar como erro.
					return;
				}

				let tabela: string;
				let campos: string;
				let valores: string;
				let campoParaChecar: string | null = null;
				let valorParaChecar = 0;
				let params: any[];
				const id_sensor = parseInt(mensagem.end_device_ids.device_id.substring(mensagem.end_device_ids.device_id.length - 1));
				const timestamp = parseInt(mensagem.uplink_message.rx_metadata[0].timestamp);

				if (!id_sensor) {
					Milesight.alterarUltimoErro(`Id de sensor inválido (${topic}): ${json}`);
					return;
				}

				if (!timestamp) {
					Milesight.alterarUltimoErro(`Timestamp inválido (${topic}): ${json}`);
					return;
				}

				switch (mensagem.end_device_ids.device_id) {
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
						tabela = "presenca";
						campos = "bateria, ocupado";
						valores = "?, ?";
						campoParaChecar = "ocupado";
						valorParaChecar = ((!mensagem.uplink_message.decoded_payload.occupancy || (mensagem.uplink_message.decoded_payload.occupancy == "vacant")) ? 0 : 1);
						params = [
							Math.max(0, Math.min(100, parseInt(mensagem.uplink_message.decoded_payload.battery) || 0)),
							valorParaChecar,
						];
						break;

					case "magnetic01":
					case "magnetic02":
					case "magnetic03":
						tabela = "abertura";
						campos = "bateria, fechado, instalacao";
						valores = "?, ?, ?";
						campoParaChecar = "fechado";
						valorParaChecar = ((mensagem.uplink_message.decoded_payload.door == "close") ? 1 : 0);
						params = [
							Math.max(0, Math.min(100, parseInt(mensagem.uplink_message.decoded_payload.battery) || 0)),
							valorParaChecar,
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

				Milesight.fila.push({ agora, tabela, campos, valores, campoParaChecar, valorParaChecar, params, id_sensor, timestamp });
				Milesight.inserir();
			});
		} catch (ex: any) {
			Milesight.alterarUltimoErro(ex.message || ex.toString());
			Milesight.alterarStatus("Exceção");
		}
	}
}

export = Milesight;
