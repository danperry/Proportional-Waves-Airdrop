let Waves = WavesAPI.create(WavesAPI.MAINNET_CONFIG);


class BaseComponent extends React.Component {
	constructor(){
		super();
		this.state = {
			wallets: null,
			fundTokenId: 'FRTdu9anMx96i2CKQTLZbwYboXqjk23D9xqCi1kqH8fT',
			fundTokenInfo: null,
			fundValue: 100,
			transactionFee: 0.001,
			seed: null,
			payoutPercent: 2,
			payoutTokenId: '8LQW8f7P5d5PZM7GtZEBgaqRPGSzS3DfPuiXrURJ4AJS',
			payoutTokenInfo: null,
			transactionResultLog: "",
			disableSubmit: false
		};
	}

	componentWillMount(){
		this._updateToken('fund');
		this._updateToken('payout');
		this._loadWallets()
	}

	_loadWallets(){
		Waves.API.Node.v1.assets.distribution(this.state.fundTokenId)
		.then((distributionMap) => {
			this.setState({
				wallets: _.keys(distributionMap).map((key)=>{
					return {
						id: key,
						balance: distributionMap[key]
					};
				})
			});
		});
	}

	_loadSeedInfo(seedPhrase){
		const seed = Waves.Seed.fromExistingPhrase(seedPhrase);
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
			[tokenName + "TokenInfo"]: null
		});
		Waves.Asset.get(tokenId).then((info) => this.setState({[tokenName + "TokenInfo"]: info}));
	}

	_createTransactions(){
		let totalPayout = this.state.fundValue * (+this.state.payoutPercent / 100);
		let totalDist = this.state.wallets.reduce((total, wallet) => total + wallet.balance, 0);
		return this.state.wallets.map((wallet, index) => {
			return {
			    recipient: wallet.id,

			    // ID of a token, or WAVES
			    assetId: this.state.payoutTokenId,

			    // The real amount is the given number divided by 10^(precision of the token)
			    amount: Math.round(totalPayout * (wallet.balance/totalDist) * +`1E${this.state.payoutTokenInfo.precision}`),

			    // The same rules for these two fields
			    feeAssetId: 'WAVES',
			    fee: Math.round(+this.state.transactionFee * 1E8),

			    // 140 bytes of data (it's allowed to use Uint8Array here)
			    attachment: `${this.state.payoutPercent}% dividend payment for ${this.state.fundTokenInfo.name}`,

			    timestamp: Date.now()
			};
		});
	}

	_renderTokenInfo(info){
		return `${info.name} Precision: ${info.precision}`;
	}

	_renderTokenInput(tokenName){
		const cappedName = tokenName.charAt(0).toUpperCase() + tokenName.substr(1).toLowerCase();
		return <div key={tokenName}>
			{cappedName} Token ID: <input type="text"
				value={this.state[tokenName + "TokenId"]}
				onChange={(event) => this._updateToken(tokenName, event.target.value)}/>
				{this.state[tokenName + "TokenInfo"]
					? this._renderTokenInfo(this.state[tokenName + "TokenInfo"])
					: `Loading ${cappedName} Token Info...`
				}<br/>
		</div>;
	}

	render() {
		let totalPayout = this.state.fundValue * (+this.state.payoutPercent / 100);
		let walletsSection;
		if (this.state.wallets){
			let totalDist = this.state.wallets.reduce((total, wallet) => total + wallet.balance, 0);
			let higestBalanceIndex = this.state.wallets.reduce((highestIndex, wallet, index) =>
				(wallet.balance > this.state.wallets[highestIndex].balance) ? index : highestIndex, 0);
			walletsSection = <div>
				<table>
					<thead>
						<tr>
							<th>Wallet</th>
							<th>Balance</th>
							<th>Percent</th>
							<th>Payout</th>
							<th>Remove</th>
						</tr>
					</thead>
					<tbody>{
						this.state.wallets.map((wallet, index) => {
							let payoutShare = wallet.balance/totalDist;
							return <tr key={wallet.id} style={index === higestBalanceIndex ? {"backgroundColor":'lightgray'} : null}>
								<td>{wallet.id}</td>
								<td>{wallet.balance / +`1E${this.state.fundTokenInfo.precision}`}</td>
								<td>{Math.round(payoutShare * 100000)/1000}%</td>
								<td>{totalPayout * payoutShare}</td>
								<td><button
									onClick={() => {
										let newWallets = this.state.wallets.slice();
										newWallets.splice(index, 1);
										this.setState({
											wallets: newWallets
										});
									}}>
									-
								</button></td>
							</tr>
						})
					}</tbody>
				</table>
				<button
					onClick={() => {
						this.setState({wallets: null});
						this._loadWallets();
					}}>
					Reload Wallets
				</button><hr/>
				<textarea
					style={{width: '100%', height: '20em'}}
					value={JSON.stringify(this._createTransactions(), null, 2)}/><br/>
				<button
					onClick={() => {
						let transactions = this._createTransactions();
						let totalPayout = transactions.reduce((total, transaction) => total + transaction.amount, 0);
						if (!window.confirm(`Are you sure you want to submit ${transactions.length} transactions totalling ${totalPayout / +`1E${this.state.payoutTokenInfo.precision}`} ${this.state.payoutTokenInfo.name}`)){
							return
						}
						transactions.forEach((transaction) => {
							Waves.API.Node.v1.assets.transfer(transaction, this.state.seed.keyPair).then((responseData) => {
							    this.setState({transactionResultLog: this.state.transactionResultLog + '\n'
							    	+ JSON.stringify(responseData, null, 2)});
							}).catch((responseData) => {
							    this.setState({transactionResultLog: this.state.transactionResultLog + '\n'
							    	+ JSON.stringify(responseData, null, 2)});
							});
						});
					}}>
					Submit Transactions
				</button>
			</div>
		} else {
			walletsSection = "Loading Wallets..."
		}
		return <div>
			{this._renderTokenInput('fund')}
			<div>
				Payout Share: <input
					value={this.state.payoutPercent}
					onChange={(event) => this.setState({payoutPercent: event.target.value})}/>%<br/>
			</div>
			<div>
				Fund Value: <input
					value={this.state.fundValue}
					onChange={(event) => this.setState({fundValue: event.target.value})}/>BTC<br/>
			</div>
			<div>
				Transaction Fee: <input
					value={this.state.transactionFee}
					onChange={(event) => this.setState({transactionFee: event.target.value})}/>Waves<br/>
			</div>
			{this._renderTokenInput('payout')}
			<div>
				Payout Wallet Seed: <input
					type="password"
					value={this.state.seed && this.state.seed.phrase || ""}
					onChange={(event) => this._loadSeedInfo(event.target.value)}
				/>{this.state.seedInfo}<br/>
			</div><hr/>
			{walletsSection}<hr/>
			Transaction Result Log <br/>
			<textarea
				style={{width: '100%', height: '20em'}}
				value={this.state.transactionResultLog}/><br/>
  		</div>;
  	}
}

 ReactDOM.render(<BaseComponent/>, document.body);
