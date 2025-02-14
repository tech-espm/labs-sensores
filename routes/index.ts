import app = require("teem");
import appsettings = require("../appsettings");
import DataUtil = require("../utils/dataUtil");
import Log = require("../models/log");
import Milesight = require("../models/milesight");
import Steinel = require("../models/steinel");

class IndexRoute {
	public static async index(req: app.Request, res: app.Response) {
		res.send(`<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Status</title>
	<style type="text/css">
		body {
			font-family: sans-serif;
		}
	</style>
</head>
<body>
	<h1>Status</h1>
	<p><b>Horário do Servidor:</b> ${DataUtil.horarioDeBrasiliaISOComHorario()}</p>
	<hr/>
	${Log.obterStatusHTML()}
	<hr/>
	${Milesight.obterStatusHTML()}
	<hr/>
	${Steinel.obterStatusHTML()}
</body>
</html>
`);
	}

	public static async horario(req: app.Request, res: app.Response) {
		res.json(DataUtil.horarioDeBrasiliaISOComHorario());
	}

	public static async dados(req: app.Request, res: app.Response) {
		let tabela: string;
		let campos: string;

		const sensor = req.query["sensor"] as string;
		switch (sensor) {
			case "pca":
				tabela = "pca";
				campos = "pessoas, luminosidade, umidade, temperatura";
				break;

			case "creative":
				tabela = "creative";
				campos = "luminosidade, umidade, temperatura, voc, co2, pressao_ar, ruido, aerosol_parado, aerosol_risco, ponto_orvalho";
				break;

			case "soil":
				tabela = "solo";
				campos = "condutividade, umidade, temperatura";
				break;

			case "odor":
				tabela = "odor";
				campos = "bateria, h2s, umidade, nh3, temperatura";
				break;

			case "presence":
				tabela = "presenca";
				campos = "bateria, ocupado";
				break;

			case "magnetic":
				tabela = "abertura";
				campos = "bateria, fechado, instalacao";
				break;

			case "temperature":
				tabela = "temperatura";
				campos = "umidade, temperatura";
				break;

			case "passage":
				tabela = "passagem";
				campos = "bateria, entrada, saida";
				break;

			default:
				return;
		}

		let where = "";
		const params: any[] = [];

		const id_inferior = parseInt(req.query["id_inferior"] as string);
		if (!isNaN(id_inferior)) {
			if (where)
				where += " AND ";
			where += "id > ?"
			params.push(id_inferior);
		}

		const data_inicial = DataUtil.converterDataISO(req.query["data_inicial"] as string);
		const data_final = DataUtil.converterDataISO(req.query["data_final"] as string);
		if (data_inicial || data_final) {
			if (!data_inicial || !data_final) {
				res.status(400).json("Intervalo de datas inválido");
				return;
			}

			if (where)
				where += " AND ";
			where += "data BETWEEN ? AND ?"
			params.push(data_inicial, data_final);
		}

		if (!where) {
			res.status(400).json("É necessário fornecer ao menos um id inferior ou um intervalo de datas válido");
			return;
		}

		const id_sensor = parseInt(req.query["id_sensor"] as string) || 0;
		if (id_sensor) {
			if (where)
				where += " AND ";
			where += "id_sensor = ?"
			params.push(id_sensor);
		}

		await app.sql.connect(async sql => {
			res.json(await sql.query(`SELECT id, date_format(data, '%Y-%m-%d %H:%i:%s') data, id_sensor, delta, ${campos} FROM ${tabela} WHERE ${where} ORDER BY id ASC`, params));
		});
	}
}

export = IndexRoute;
