import app = require("teem");
import DataUtil = require("../utils/dataUtil");

interface ItemLog {
	tabela: string;
	data: string;
	id_sensor: number;
	delta: number;
	campos: string;
	valores: string;
	params: any[];
}

class Log {
	private static ultimoErro: string | null = null;
	private static inserindo = false;
	private static fila: ItemLog[] = [];

	public static obterStatusHTML(): string {
		return `
<h1>Status Log do Banco</h1>
<p><b>Último Erro:</b> ${(Log.ultimoErro || "")}</p>
`;
	}

	private static alterarUltimoErro(erro: string): void {
		Log.ultimoErro = `${DataUtil.horarioDeBrasiliaISOComHorario()}: ${erro}`;
		console.error(`Log do Banco: ${Log.ultimoErro}`);
	}

	public static inserir(itemLog: ItemLog): void {
		Log.fila.push(itemLog);

		if (Log.inserindo)
			return;

		Log.inserindo = true;
		app.sql.connect(async sql => {
			do {
				const itemFila = Log.fila.shift();
				if (!itemFila)
					break;

				try {
					await sql.query(`INSERT INTO ${itemFila.tabela} (data, id_sensor, delta, ${itemFila.campos}) VALUES (?, ?, ?, ${itemFila.valores})`, [itemFila.data, itemFila.id_sensor, itemFila.delta, ...itemFila.params]);
				} catch (ex: any) {
					Log.alterarUltimoErro(`Exceção na fila: ${ex.message || ex.toString()}`);
				}
			} while (Log.fila.length);

			Log.inserindo = false;
		}).catch(reason => {
			Log.inserindo = false;
			Log.alterarUltimoErro(`Exceção na conexão: ${reason.message || reason.toString()}`);
		});
	}
}

export = Log;
