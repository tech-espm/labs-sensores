import app = require("teem");
import appsettings = require("../appsettings");
import DataUtil = require("../utils/dataUtil");
import Milesight = require("../models/milesight");

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
	${Milesight.obterStatusHTML()}
</body>
</html>
`);
	}

	public static async horario(req: app.Request, res: app.Response) {
		res.json(DataUtil.horarioDeBrasiliaISOComHorario());
	}
}

export = IndexRoute;
