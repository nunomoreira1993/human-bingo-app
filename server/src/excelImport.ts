import readXlsxFile from 'read-excel-file/node'

type SkippedRow = {
	rowNumber: number
	reason: string
}

export type CustomerFestRow = {
	rowNumber: number
	email: string
	name?: string
	factText: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cellText(value: unknown) {
	return String(value ?? '').trim()
}

function normalizeFactText(value: string) {
	return value.replace(/\s+/g, ' ').trim()
}

function isHeaderRow(email: string, factText: string) {
	const normalizedEmail = email.toLowerCase()
	const normalizedFact = factText.toLowerCase()

	return ['email', 'e-mail', 'mail'].includes(normalizedEmail) || normalizedFact.includes('fun fact') || normalizedFact.includes('curiosidade')
}

export async function parseCustomerFestWorkbook(buffer: Buffer) {
	const sheets = await readXlsxFile(buffer) as unknown as Array<{ sheet: string; data: unknown[][] }>

	if (!sheets.length) {
		throw Object.assign(new Error('O ficheiro Excel não tem folhas para importar.'), { statusCode: 400 })
	}

	const rows: CustomerFestRow[] = []
	const skippedRows: SkippedRow[] = []

	sheets.forEach((sheet) => {
		sheet.data.forEach((row, rowIndex) => {
			const rowNumber = rowIndex + 1
			const email = cellText(row[3]).toLowerCase()
			const name = cellText(row[4]) || undefined
			const factText = normalizeFactText(cellText(row[5]))

			if (!email && !factText) return

			if (isHeaderRow(email, factText)) return

			if (!emailPattern.test(email)) {
				skippedRows.push({ rowNumber, reason: `E-mail inválido ou em falta na coluna D (${sheet.sheet}).` })
				return
			}

			if (!factText) {
				skippedRows.push({ rowNumber, reason: `Fun fact em falta na coluna F (${sheet.sheet}).` })
				return
			}

			rows.push({ rowNumber, email, name, factText })
		})
	})

	if (!rows.length) {
		throw Object.assign(new Error('Não foram encontradas linhas válidas nas colunas D e F.'), { statusCode: 400 })
	}

	return { rows, skippedRows }
}
