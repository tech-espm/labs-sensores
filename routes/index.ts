import app = require("teem");
import appsettings = require("../appsettings");
import DataUtil = require("../utils/dataUtil");

class IndexRoute {
	public static async index(req: app.Request, res: app.Response) {
		res.json("Log de Sensores " + DataUtil.horarioDeBrasiliaISOComHorario());
	}

	public static async horario(req: app.Request, res: app.Response) {
		res.json(DataUtil.horarioDeBrasiliaISOComHorario());
	}
}

export = IndexRoute;
