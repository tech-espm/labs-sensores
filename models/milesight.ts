import app = require("teem");
import appsettings = require("../appsettings");
import mqtt = require("mqtt");
import DataUtil = require("../utils/dataUtil");

class Milesight {
	private static dataCliente: string | null = null;
	private static cliente: mqtt.MqttClient | null = null;
	private static statusCliente: string | null = null;
	private static ultimoErro: string | null = null;

	public static obterStatusHTML(): string {
		return `
<h1>Status Milesight</h1>
<p><b>Cliente:</b> ${(Milesight.cliente ? Milesight.dataCliente : "null")}</p>
<p><b>Status Cliente:</b> ${(Milesight.statusCliente || "")}</p>
<p><b>Último Erro:</b> ${(Milesight.ultimoErro || "")}</p>
`;
	}

	private static alterarStatus(status: string): void {
		Milesight.statusCliente = DataUtil.horarioDeBrasiliaISOComHorario() + ": " + status;
	}

	private static alterarUltimoErro(erro: string): void {
		Milesight.ultimoErro = DataUtil.horarioDeBrasiliaISOComHorario() + ": " + erro;
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
				keepalive: 10
			});

			Milesight.dataCliente = DataUtil.horarioDeBrasiliaISOComHorario();
			Milesight.cliente = c;

			c.on("connect", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Conectado!");
			});

			c.on("disconnect", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Desconectado");
			});

			Milesight.cliente.on("reconnect", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Reconectando...");
			});

			Milesight.cliente.on("close", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Terminado");
			});

			Milesight.cliente.on("offline", function () {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Offline");
			});

			Milesight.cliente.on("erro", function (error: Error) {
				if (Milesight.cliente !== c)
					return;

				Milesight.alterarStatus("Erro");
				Milesight.alterarUltimoErro(error.message || error.toString());
			});
		} catch (ex: any) {
			Milesight.alterarUltimoErro(ex.message || ex.toString());
			Milesight.alterarStatus("Exceção");
		}
	}
}

export = Milesight;
