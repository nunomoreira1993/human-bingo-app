import readXlsxFile from 'read-excel-file/node'

type SkippedRow = {
	rowNumber: number
	reason: string
}

export type CustomerFestRow = {
	rowNumber: number
	email: string
	factText: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cellText(value: unknown) {
	return String(value ?? '').trim()
}

function normalizeFactText(value: string) {
	return value.replace(/\s+/g, ' ').trim()
}

export async function parseCustomerFestWorkbook(buffer: Buffer) {
	const worksheetRows = await readXlsxFile(buffer) as unknown as unknown[][]

	if (!worksheetRows.length) {
		throw Object.assign(new Error('O ficheiro Excel não tem folhas para importar.'), { statusCode: 400 })
	}

	const rows: CustomerFestRow[] = []
	const skippedRows: SkippedRow[] = []

	worksheetRows.forEach((row, rowIndex) => {
		const rowNumber = rowIndex + 1
		const email = cellText(row[3]).toLowerCase()
		const factText = normalizeFactText(cellText(row[5]))

		if (!email && !factText) return

		if (!emailPattern.test(email)) {
			skippedRows.push({ rowNumber, reason: 'E-mail inválido ou em falta na coluna D.' })
			return
		}

		if (!factText) {
			skippedRows.push({ rowNumber, reason: 'Fun fact em falta na coluna F.' })
			return
		}

		rows.push({ rowNumber, email, factText })
	})

	if (!rows.length) {
		throw Object.assign(new Error('Não foram encontradas linhas válidas nas colunas D e F.'), { statusCode: 400 })
	}

	return { rows, skippedRows }
}
