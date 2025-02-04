import app = require("teem");
import appsettings = require("../appsettings");
import mqtt = require("mqtt");
import DataUtil = require("../utils/dataUtil");
import Log = require("./log");

class Steinel {
	private static dataCliente: string | null = null;
	private static cliente: mqtt.MqttClient | null = null;
	private static statusCliente: string | null = null;
	private static ultimoErro: string | null = null;
	private static readonly zonas = 8;
	private static readonly pcaTimestamp = [0, 0, 0, 0, 0, 0, 0, 0];
	private static readonly pcaPessoasPorZona = [0, 0, 0, 0, 0, 0, 0, 0];
	private static readonly pcaLuminosidadePorZona = [0, 0, 0, 0, 0, 0, 0, 0];
	private static pcaUmidade = 0;
	private static pcaTemperatura = 0;

	public static obterStatusHTML(): string {
		return `
<h1>Status Steinel</h1>
<p><b>Cliente:</b> ${(Steinel.cliente ? Steinel.dataCliente : "null")}</p>
<p><b>Status Cliente:</b> ${(Steinel.statusCliente || "")}</p>
<p><b>Último Erro:</b> ${(Steinel.ultimoErro || "")}</p>
`;
	}

	private static alterarStatus(status: string): void {
		Steinel.statusCliente = `${DataUtil.horarioDeBrasiliaISOComHorario()}: ${status}`;
	}

	private static alterarUltimoErro(erro: string): void {
		Steinel.ultimoErro = `${DataUtil.horarioDeBrasiliaISOComHorario()}: ${erro}`;
		console.error(`Steinel: ${Steinel.ultimoErro}`);
	}

	public static iniciar(): void {
		if (Steinel.cliente)
			return;

		Steinel.ultimoErro = null;
		Steinel.alterarStatus("Iniciando dados do banco...");

		app.sql.connect(async sql => {
			let maiorIdUmidadeTemperatura = 0;

			for (let i = Steinel.zonas - 1; i >= 0; i--) {
				const dados: any[] = await sql.query("SELECT id, date_format(data, '%Y-%m-%d %H:%i:%s') data, pessoas, luminosidade, umidade, temperatura FROM pca WHERE id_sensor = ? ORDER BY id DESC LIMIT 1", [i + 1]);
				if (!dados || !dados.length)
					continue;

				const dado = dados[0];

				if (maiorIdUmidadeTemperatura < dado.id) {
					maiorIdUmidadeTemperatura = dado.id;
					Steinel.pcaUmidade = dado.umidade;
					Steinel.pcaTemperatura = dado.temperatura;
				}

				Steinel.pcaTimestamp[i] = (new Date(dado.data + " Z")).getTime();
				Steinel.pcaPessoasPorZona[i] = dado.pessoas;
				Steinel.pcaLuminosidadePorZona[i] = dado.luminosidade;
			}
		}).then(() => {
			try {
				Steinel.alterarStatus("Conectando...");

				const c = mqtt.connect(appsettings.steinel.host, {
					clientId: appsettings.steinel.clientId,
					username: appsettings.steinel.user,
					password: appsettings.steinel.password,
					clean: true,
					resubscribe: false,
					reconnectPeriod: 1000,
					connectTimeout: 30 * 1000,
					keepalive: 30
				});

				Steinel.dataCliente = DataUtil.horarioDeBrasiliaISOComHorario();
				Steinel.cliente = c;

				c.on("connect", () => {
					if (Steinel.cliente !== c)
						return;

					Steinel.alterarStatus("Conectado!");

					c.subscribe("espm/stainel/#", { qos: 2 });
				});

				c.on("disconnect", () => {
					if (Steinel.cliente !== c)
						return;

					Steinel.alterarStatus("Desconectado");
				});

				c.on("reconnect", () => {
					if (Steinel.cliente !== c)
						return;

					Steinel.alterarStatus("Reconectando...");
				});

				c.on("close", () => {
					if (Steinel.cliente !== c)
						return;

					Steinel.alterarStatus("Terminado");
				});

				c.on("offline", () => {
					if (Steinel.cliente !== c)
						return;

					Steinel.alterarStatus("Offline");
				});

				c.on("erro", (error: Error) => {
					if (Steinel.cliente !== c)
						return;

					Steinel.alterarStatus("Erro");
					Steinel.alterarUltimoErro(error.message || error.toString());
				});

				c.on("message", (topic: string, payload: Buffer, packet: any) => {
					if (Steinel.cliente !== c || !payload)
						return;

					let mensagem: any;
					let json: string | null = null;
					try {
						mensagem = JSON.parse(json = payload.toString("utf8"));
					} catch (ex: any) {
						Steinel.alterarUltimoErro(`Erro ao decodificar payload (${topic}): ${(ex.message || ex.toString())} / ${json}`);
						return;
					}

					if (!mensagem) {
						Steinel.alterarUltimoErro(`Mensagem vazia (${topic})`);
						return;
					}

					const agora = DataUtil.horarioDeBrasiliaComoDateUTC();
					const agoraTimestamp = agora.getTime();

					switch (topic) {
						case "espm/stainel/hpd/DetectedPersonsZone":
							if (!mensagem.DetectedPersonsZone || !Array.isArray(mensagem.DetectedPersonsZone) || mensagem.DetectedPersonsZone.length < 8) {
								Steinel.alterarUltimoErro(`Campo DetectedPersonsZone inválido (${topic}): ${json}`);
								return;
							}

							for (let i = Steinel.zonas - 1; i >= 0; i--) {
								let pessoas = parseInt(mensagem.DetectedPersonsZone[i]);
								if (isNaN(pessoas))
									continue;

								pessoas = Math.max(0, Math.min(100, pessoas));

								if (Steinel.pcaPessoasPorZona[i] !== pessoas) {
									const delta = ((Steinel.pcaTimestamp[i] ? (agoraTimestamp - Steinel.pcaTimestamp[i]) : 0) / 1000) | 0;
									Steinel.pcaTimestamp[i] = agoraTimestamp;
									Steinel.pcaPessoasPorZona[i] = pessoas;
									Log.inserir({
										tabela: "pca",
										data: DataUtil.formatarDateUTCComHorario(agora),
										id_sensor: i + 1,
										delta,
										campos: "pessoas, luminosidade, umidade, temperatura",
										valores: "?, ?, ?, ?",
										params: [
											Steinel.pcaPessoasPorZona[i],
											Steinel.pcaLuminosidadePorZona[i],
											Steinel.pcaUmidade,
											Steinel.pcaTemperatura,
										]
									});
								}
							}
							break;

						case "espm/stainel/hpd/LuxZone":
							if (!mensagem.LuxZone || !Array.isArray(mensagem.LuxZone) || mensagem.LuxZone.length < 8) {
								Steinel.alterarUltimoErro(`Campo LuxZone inválido (${topic}): ${json}`);
								return;
							}

							for (let i = Steinel.zonas - 1; i >= 0; i--) {
								const luminosidade = parseFloat(mensagem.LuxZone[i]);
								if (isNaN(luminosidade))
									continue;

								Steinel.pcaLuminosidadePorZona[i] = Math.max(0, luminosidade);
							}
							break;

						case "espm/stainel/hpd/Humidity":
							if (!mensagem.Humidity || isNaN(mensagem.Humidity = parseFloat(mensagem.Humidity))) {
								Steinel.alterarUltimoErro(`Campo Humidity inválido (${topic}): ${json}`);
								return;
							}

							Steinel.pcaUmidade = mensagem.Humidity;
							break;

						case "espm/stainel/hpd/Temperature":
							if (!mensagem.Temperature || isNaN(mensagem.Temperature = parseFloat(mensagem.Temperature))) {
								Steinel.alterarUltimoErro(`Campo Temperature inválido (${topic}): ${json}`);
								return;
							}

							Steinel.pcaTemperatura = mensagem.Temperature;
							break;
					}
				});
			} catch (ex: any) {
				Steinel.alterarUltimoErro(ex.message || ex.toString());
				Steinel.alterarStatus("Exceção");
			}
		}, reason => {
			Steinel.alterarUltimoErro("Exceção ao iniciar dados do banco: " + (reason.message || reason.toString()));
		});
	}
}

export = Steinel;
