let Waves = WavesAPI.create(WavesAPI.MAINNET_CONFIG);

function makeRequest (method, url) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(JSON.parse(xhr.response));
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    xhr.send();
  });
}

class BaseComponent extends React.Component {
	constructor(){
		super();
		this.state = {
			wallets: null,
			managerWalletId: null,
			fundWalletId: null,
			fundTokenId: 'FRTdu9anMx96i2CKQTLZbwYboXqjk23D9xqCi1kqH8fT',
			fundTokenInfo: {name: 'Loading', precision: 0},
			fundValue: 100,
			transactionFee: 0.001,
			lastDistribution: 10,
			thisDistribution: null,
			payoutTokenInCAD: 10000,
			btcValue: null,
			seed: null,
			payoutShare: 2,
			managerInfusionFee: 1,
			payoutTokenId: '8LQW8f7P5d5PZM7GtZEBgaqRPGSzS3DfPuiXrURJ4AJS',
			payoutTokenInfo: {name: 'Loading', precision: 0},
			transactionResultLog: "",
			disableSubmit: false
		};
	}

	componentWillMount(){
		this._updateToken('fund');
		this._updateToken('payout');
		this._loadBTC2CAD();
		this._loadWallets();
	}

	_loadBTC2CAD(){
		makeRequest('GET', 'https://blockchain.info/ticker?cors=true')
		.then((rates) => this.setState({btcValue: rates.CAD['15m']}))
	}

	_loadWallets(){
		this.setState({
			wallets: null,
			fundWalletId: null,
			thisDistribution: null
		});
		Waves.API.Node.v1.assets.distribution(this.state.fundTokenId)
		// let result = {
		//   "3P9MeJbDGvBvF9BLPkHKaUCvhvsq3wdoLZr" : 376385300000,
		//   "3P2AovdtTpH5y8nEyiptUugxeSbZ2trspv1" : 969132285532900,
		//   "3PF4oMmk5NpPTEPduvwmWRSYTatyun6yAsG" : 13021055555555,
		//   "3PK9fUwuAv3yzNzgN6aX1jjgwbmANRSjgeQ" : 892872474588,
		//   "3PD9P8qqUgnHzfHWii39nXZvTpKr3kzLDmn" : 33333307042,
		//   "3PFXsqbkKvYMAc8mcdWYMqhHXySsAZk1Ypb" : 7048122441685,
		//   "3P2HJDYcMKJuCK51zGk8ccrockKi1Q84sRB" : 285171102661,
		//   "3PHfRTvi3MaMJTJN2LZmxeMuiTRmcgyP2vC" : 35211199999,
		//   "3PFyfQEWCGvaLk9upPVVffyyUNJCSc2yGRs" : 7679950183109,
		//   "3PQP8r7ecYrU3R2hyp73JVPSrQACsoEHv4b" : 1055029402461,
		//   "3P8uFT3SyLAwtcucASuP7wJFqhhcBe1amf5" : 440583500000
		// };
		// new Promise((resolve) => setTimeout(()=> resolve(result), 5000))
		.then((distributionMap) => {
			let fundWallet;
			let fundWalletIndex;
			let wallets = _.keys(distributionMap).map((key, index)=>{
				let wallet = {
					id: key,
					balance: distributionMap[key]
				};

				if (!fundWallet || distributionMap[key] > fundWallet.balance) {
					fundWallet = wallet;
					fundWalletIndex = index;
				}

				return wallet;
			});

			wallets.splice(fundWalletIndex, 1);
			this.setState({
				wallets: wallets,
				fundWalletId: fundWallet.id,
				thisDistribution: wallets.reduce((total, wallet) => total + wallet.balance, 0) / +`1E${this.state.fundTokenInfo.precision || 0}`
			});
		});
	}

	_loadSeedInfo(seedPhrase){
		const seed = Waves.Seed.fromExistingPhrase(seedPhrase);
		if (seed.address !== this.state.fundWalletId){
			alert(`Seed wallet (${seed.address}) Doesn't match the fund wallet address of ${this.state.fundWalletId}`);
		}

		this.setState({
			seed: seed,
			seedInfo: "Loading Payout Token Balance..."
		});
		Waves.API.Node.v1.assets.balance(seed.address, this.state.payoutTokenId).then(({balance}) => {
		   this.setState({seedInfo: `${balance / +`1E${this.state.payoutTokenInfo.precision}`} ${this.state.payoutTokenInfo.name}`})
		});
	}

	_updateToken(tokenName, tokenId = this.state[tokenName + "TokenId"]){
		this.setState({
			[tokenName + "TokenId"]: tokenId,
			[tokenName + "TokenInfo"]: {name: 'Loading', precision: 0}
		});
		Waves.Asset.get(tokenId).then((info) => this.setState({[tokenName + "TokenInfo"]: info}));
	}

	_createTransactions(){
		let totalPayout = this.state.fundValue * (+this.state.payoutShare / 100);
		let totalDist = this.state.wallets.reduce((total, wallet) => total + wallet.balance, 0);
		return this.state.wallets.map((wallet, index) => {
			return {
			    recipient: wallet.id,
			    assetId: this.state.payoutTokenId,
			    amount: Math.round(totalPayout * (wallet.balance/totalDist) * +`1E${this.state.payoutTokenInfo.precision}`),
			    feeAssetId: 'WAVES',
			    fee: Math.round(+this.state.transactionFee * 1E8),
			    attachment: `${this.state.payoutShare}% dividend payment for ${this.state.fundTokenInfo.name}`,
			    timestamp: Date.now()
			};
		});
	}

	_createManagerFeeTransaction(){
		return {
		    recipient: this.state.managerWalletId,
		    assetId: this.state.fundTokenId,
		    amount: Math.round((this.state.thisDistribution - this.state.lastDistribution) * +`1E${this.state.fundTokenInfo.precision}` * (this.state.managerInfusionFee / 100)),
		    feeAssetId: 'WAVES',
		    fee: Math.round(+this.state.transactionFee * 1E8),
		    attachment: `${this.state.managerInfusionFee}% manager fee for ${this.state.thisDistribution - this.state.lastDistribution} infusion`,
		    timestamp: Date.now()
		};
	}

	_renderTokenInput(tokenName){
		const cappedName = this._capString(tokenName);
		const tokenInfo = this.state[tokenName + "TokenInfo"];
		return <div key={tokenName}>
			{cappedName} Token ID: <input type="text"
				value={this.state[tokenName + "TokenId"]}
				onChange={(event) => this._updateToken(tokenName, event.target.value)}/>
				{tokenInfo.name}
				{tokenInfo.precision ? ` Precision: ${tokenInfo.precision}` : ''}
				<br/>
		</div>;
	}

	_capString(string){
		return string.charAt(0).toUpperCase() + string.substr(1).toLowerCase();
	}

	_camelCaseString(string){
		let words = string.split(' ');
		return words[0].toLowerCase() + words.slice(1).map(this._capString).join('');
	}

	_renderInput(name, units = ''){
		let camelName = this._camelCaseString(name);
		return <div>
			{name}: <input
				value={this.state[camelName]}
				onChange={(event) => this.setState({[camelName]: event.target.value})}
			/>{units}<br/>
		</div>;
	}

	_submitTransaction(transaction){
		return Waves.API.Node.v1.assets.transfer(transaction, this.state.seed.keyPair).then((responseData) => {
		    this.setState({transactionResultLog: this.state.transactionResultLog + '\n'
		    	+ JSON.stringify(responseData, null, 2)});
		}).catch((responseData) => {
		    this.setState({transactionResultLog: this.state.transactionResultLog + '\n'
		    	+ JSON.stringify(responseData, null, 2)});
		});
	}

	_renderWalletsSection(){
		if (!this.state.wallets) return "Loading Wallets..."
		let totalPayout = this.state.fundValue * (+this.state.payoutShare / 100);
		let walletsSection;
		let totalDist = this.state.wallets.reduce((total, wallet) => total + wallet.balance, 0);
		let higestBalanceIndex = this.state.wallets.reduce((highestIndex, wallet, index) =>
			(wallet.balance > this.state.wallets[highestIndex].balance) ? index : highestIndex, 0);
		return <div>
			<h2>Investor Wallets</h2>
			<table>
				<thead><tr>
					<th>Wallet</th><th>Balance</th><th>Percent</th><th>Payout</th><th>Pick as Manager Wallet</th>
				</tr></thead>
				<tbody>{
					this.state.wallets.map((wallet, index) => {
						let payoutShare = wallet.balance/totalDist;
						return <tr key={wallet.id}>
							<td>{wallet.id}</td>
							<td>{wallet.balance / +`1E${this.state.fundTokenInfo.precision}`}</td>
							<td>{Math.round(payoutShare * 100000)/1000}%</td>
							<td>{totalPayout * payoutShare}</td>
							<td><button onClick={() => this.setState({managerWalletId: wallet.id})}>Choose</button></td>
						</tr>
					})
				}</tbody>
			</table>
			<button onClick={() => this._loadWallets()}>Reload Wallets</button>
			<hr/>
			<h2>Manager Fee Transaction</h2>
			<textarea
				style={{width: '100%', height: '11em'}}
				value={JSON.stringify(this._createManagerFeeTransaction(), null, 2)}/><br/>
			<button
				disabled={!this.state.managerWalletId || !this.state.seed}
				onClick={() => {
					let transaction = this._createManagerFeeTransaction();
					if (!window.confirm(`Are you sure you want to submit a fee transaction for ${transaction.amount/ +`1E${this.state.fundTokenInfo.precision}`} ${this.state.fundTokenInfo.name}`)){
						return
					}
					this._submitTransaction(transaction).then(()=> this._loadWallets());
				}}>
				Submit Manager Fee Transaction
			</button>
			<hr/>
			<h2>Payout Transactions</h2>
			<textarea
				style={{width: '100%', height: '20em'}}
				value={JSON.stringify(this._createTransactions(), null, 2)}/><br/>
			<button
				disabled={!this.state.seed}
				onClick={() => {
					let transactions = this._createTransactions();
					let totalPayout = transactions.reduce((total, transaction) => total + transaction.amount, 0);
					if (!window.confirm(`Are you sure you want to submit ${transactions.length} transactions totalling ${totalPayout / +`1E${this.state.payoutTokenInfo.precision}`} ${this.state.payoutTokenInfo.name}`)){
						return
					}
					Promise.all(transactions.map((transaction) => this._submitTransaction(transaction)))
					.then(()=>this._loadWallets())
				}}>
				Submit Payout Transactions
			</button>
			<h2>Ledger Info</h2>
			<table>
				<thead><tr>
					<th>Date</th>
					<th>New Infusions in {this.state.fundTokenInfo.name}</th>
					<th>New Fund Value in {this.state.payoutTokenInfo.name}</th>
					<th>BTC in CAD</th>
				</tr></thead>
				<tbody><tr>
					<td>{new Date(Date.now() - 1000*60*(new Date().getTimezoneOffset())).toISOString().substr(0,10)}</td>
					<td>{(this.state.thisDistribution || 0) - this.state.lastDistribution}</td>
					<td>{this.state.fundValue - this._createTransactions().reduce((total, transaction) => total + transaction.amount, 0) / +`1E${this.state.fundTokenInfo.precision}`}</td>
					<td>{this.state.btcValue}</td>
				</tr></tbody>
			</table>
		</div>;
	}

	render() {
		return <div>
			<h1>Proportional Airdrop Tool</h1>
			<h2>Info</h2>
			{this._renderTokenInput('fund')}
			{this._renderInput("Payout Share", "%")}
			{this._renderInput("Manager Infusion Fee", "%")}
			{this._renderInput("Fund Value", "BTC")}
			<div>Bitcoin price in CAD: {`$${this.state.btcValue}` || 'Loading...'}</div>
			{this._renderInput("Transaction Fee", "Waves")}
			{this._renderTokenInput('payout')}
			{this._renderInput("Last Distribution")}
			<div>This Distribution: {this.state.thisDistribution || 'Loading...'}</div>
			<div>
				New Fund Infusions: {`${(this.state.thisDistribution || 0) - this.state.lastDistribution} ${this.state.fundTokenInfo.name}`}
			</div>
			<div>
				Fund Wallet Seed: <input
					type="password"
					value={this.state.seed && this.state.seed.phrase || ""}
					onChange={(event) => this._loadSeedInfo(event.target.value)}
				/>{this.state.seedInfo}<br/>
			</div>
			<div>Fund Wallet Address: {this.state.fundWalletId || 'Loading...'}</div>
			<div>Manager Wallet Address: {this.state.managerWalletId || 'Select below...'}</div>
			<hr/>
			{this._renderWalletsSection()}
			<hr/>
			<h2>Transaction Result Log</h2><br/>
			<textarea
				style={{width: '100%', height: '20em'}}
				value={this.state.transactionResultLog}/><br/>
  		</div>;
  	}
}

 ReactDOM.render(<BaseComponent/>, document.body);
